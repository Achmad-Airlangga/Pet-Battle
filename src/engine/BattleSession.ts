import { CRIT_MULTIPLIER, GLOBAL_COOLDOWN_MS, SWAP_COOLDOWN_MS, TICK_MS } from './constants.ts';
import { calculateDamage } from './damage.ts';
import { ELEMENTS, getElementMultiplier, type Element } from './elements.ts';
import { PetState, type AbilityState, type BattlePetSpec } from './pet.ts';
import { Rng } from './rng.ts';
import { STATUS_RULES, StatusEffect, type StatusInit } from './status.ts';
import {
  PLAYER_IDS,
  type BattleEvent,
  type BattleEventBody,
  type Command,
  type DamageEffect,
  type DamageSource,
  type EffectTarget,
  type GameStateSnapshot,
  type MatchEndReason,
  type MatchStatus,
  type NumberOrRange,
  type PetRef,
  type PetSnapshot,
  type LoggedCommand,
  type PlayerId,
  type RejectReason,
  type SkillEffect,
  type StatusEndReason,
  type StatusSnapshot,
  type SwapCause,
  type TickResult,
  type Validation,
  type WeatherType,
} from './types.ts';
import { redactState } from './visibility.ts';
import { WEATHER_DEFS, type WeatherDefinition } from './weather.ts';

export interface PlayerConfig {
  userId: string;
  /**
   * Exactly 2 battle pets: index 0 starts Active, index 1 starts in Reserve.
   * Each is up to 3 spliced pets (base pet first); see BattlePetSpec.
   */
  pets: readonly [BattlePetSpec, BattlePetSpec];
}

export interface BattleConfig {
  matchId: string;
  players: Record<PlayerId, PlayerConfig>;
  seed?: number;
  /** Override the RNG source (tests). */
  random?: () => number;
  /**
   * Lag compensation window (match ms). An action that was valid at the moment
   * the player pressed it (at most this long ago) is still honoured if a
   * stun/silence/root/cooldown change landed in between. 0 disables it.
   */
  lagCompensationMs?: number;
}

/** Inputs that a newer opponent action can invalidate in flight. */
const COMPENSABLE: ReadonlySet<RejectReason> = new Set<RejectReason>(['STUNNED', 'SILENCED', 'ROOTED', 'ON_COOLDOWN']);

/**
 * Pool for "Hit by Inspiration" (Passionate Painter Paintbrush): the Excel only
 * says "a random buff", so we roll one of the game's existing buffs. Durations
 * mirror the pets that introduced them.
 */
const RANDOM_BUFFS: readonly Omit<StatusInit, 'source'>[] = [
  { type: 'DAMAGE_BOOST', label: 'INSPIRED', durationMs: 10_000, value: 0.25 },
  { type: 'DODGE', label: 'INSPIRED', durationMs: 3_000 },
  { type: 'BLOCK', label: 'INSPIRED', durationMs: 3_000 },
  { type: 'DAMAGE_REDUCTION', label: 'INSPIRED', durationMs: 5_000, value: 0.5 },
  { type: 'DOUBLE_DAMAGE_CHANCE', label: 'INSPIRED', durationMs: 8_000, value: 0.25 },
  { type: 'COOLDOWN_HASTE', label: 'INSPIRED', durationMs: 8_000, value: 2 },
  { type: 'HOT', label: 'INSPIRED', durationMs: 5_000, value: 5, intervalMs: 1_000 },
];

interface ValidityRecord {
  t: number;
  /** `cast[i]` = validity of ability i of the active pet. */
  players: Record<PlayerId, { active: number; cast: Validation[]; swap: Validation }>;
}

export interface PlayerState {
  id: PlayerId;
  userId: string;
  pets: [PetState, PetState];
  activeIndex: 0 | 1;
  swapCooldownMs: number;
  /** Global skill cooldown: no skill of this player can be used until it reaches 0. */
  globalCooldownMs: number;
  /** Match time of this player's last executed action. */
  lastActionAtMs: number | null;
}

interface WeatherState {
  def: WeatherDefinition;
  durationMs: number;
  remainingMs: number;
  accumMs: number;
  source: PlayerId;
}

/**
 * One resolution of a skill. Targets are resolved from `ally`'s point of view;
 * under Possession, `ally`/`foe` are flipped while `actor` stays the possessed pet.
 */
interface CastContext {
  actor: PetState;
  ability: AbilityState;
  ally: PlayerState;
  foe: PlayerState;
  reversed: boolean;
  /** null = no attack yet; false = the attack missed, so riders on the enemy are skipped. */
  landed: boolean | null;
}

interface DamageMeta {
  source: DamageSource;
  element?: Element;
  crit?: boolean;
  attacker?: PetRef;
  label?: string;
}

export type BattleEventListener = (event: BattleEvent) => void;

const toSec = (ms: number): number => Math.round(ms / 10) / 100;

/**
 * Authoritative, UI-free Pet Battle simulation.
 *
 * Usage: `start()`, then `submit()` commands at any time; each `tick()` advances
 * the match by exactly 50ms (commands are resolved at the start of the next tick).
 * A wall-clock driver lives in TickLoop; tests call `tick()` / `advance()` directly.
 */
export class BattleSession {
  readonly matchId: string;
  readonly players: Record<PlayerId, PlayerState>;
  readonly rng: Rng;
  status: MatchStatus = 'WAITING';
  tickCount = 0;
  elapsedMs = 0;
  winner: PlayerId | 'DRAW' | null = null;
  endReason: MatchEndReason | null = null;
  private weather: WeatherState | null = null;
  private queue: Command[] = [];
  private pending: BattleEvent[] = [];
  private readonly listeners = new Set<BattleEventListener>();
  private nextUid = 1;
  /** Every processed command (accepted or not) with the tick it ran on. */
  readonly commandLog: LoggedCommand[] = [];
  readonly lagCompensationMs: number;
  /** Per-tick action validity, newest last, kept for the lag compensation window. */
  private history: ValidityRecord[] = [];

  constructor(config: BattleConfig) {
    this.matchId = config.matchId;
    this.lagCompensationMs = Math.max(0, config.lagCompensationMs ?? 200);
    this.rng = new Rng(config.seed, config.random);
    const makePlayer = (id: PlayerId): PlayerState => {
      const cfg = config.players[id];
      if (cfg.pets.length !== 2) throw new Error(`${id} must bring exactly 2 pets`);
      return {
        id,
        userId: cfg.userId,
        pets: [new PetState(cfg.pets[0], id, 0), new PetState(cfg.pets[1], id, 1)],
        activeIndex: 0,
        swapCooldownMs: 0,
        globalCooldownMs: 0,
        lastActionAtMs: null,
      };
    };
    this.players = { p1: makePlayer('p1'), p2: makePlayer('p2') };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** MATCH_START: every pet is reset to 100% HP and all skills enter their starting cooldown. */
  start(): BattleEvent[] {
    if (this.status !== 'WAITING') throw new Error(`Cannot start a match in status ${this.status}`);
    for (const player of this.allPlayers()) {
      player.activeIndex = 0;
      player.swapCooldownMs = 0;
      player.globalCooldownMs = 0;
      for (const pet of player.pets) pet.resetForMatch();
    }
    this.status = 'IN_PROGRESS';
    this.recordValidity();
    this.emit({ type: 'MATCH_START' });
    return this.flush();
  }

  /** Queue a client action; it is validated and resolved on the next tick. */
  submit(command: Command): void {
    if (this.status === 'FINISHED') return;
    this.queue.push(command);
  }

  /** Advance the simulation by one fixed 50ms step. */
  tick(): TickResult {
    if (this.status !== 'IN_PROGRESS') return { tick: this.tickCount, events: [] };
    this.tickCount++;

    // Fair ordering: inputs are resolved in the order players pressed them, not
    // the order they happened to arrive (stable sort keeps arrival order for ties).
    const commands = this.queue.splice(0).sort((a, b) => (a.atMs ?? this.elapsedMs) - (b.atMs ?? this.elapsedMs));
    for (const command of commands) {
      if (this.status !== 'IN_PROGRESS') break;
      this.commandLog.push({ tick: this.tickCount, command });
      this.executeCommand(command);
      this.resolveKnockouts();
    }
    // Snapshot right after this tick's actions, so a stun that landed at time T
    // invalidates inputs pressed at T or later (not only from the next tick).
    if (commands.length && this.status === 'IN_PROGRESS') this.recordValidity();

    if (this.status === 'IN_PROGRESS') {
      this.advanceTime(TICK_MS);
      this.resolveKnockouts();
    }
    if (this.status === 'IN_PROGRESS') this.recordValidity();

    return { tick: this.tickCount, events: this.flush() };
  }

  /** Run as many ticks as fit in `ms` of match time. */
  advance(ms: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    const ticks = Math.ceil(ms / TICK_MS);
    for (let i = 0; i < ticks && this.status === 'IN_PROGRESS'; i++) events.push(...this.tick().events);
    return events;
  }

  /** The player leaves or disconnects for good: the opponent wins immediately. */
  forfeit(playerId: PlayerId): BattleEvent[] {
    if (this.status !== 'IN_PROGRESS') return [];
    this.commandLog.push({ tick: this.tickCount, command: { type: 'FORFEIT', playerId } });
    this.finish(playerId === 'p1' ? 'p2' : 'p1', 'FORFEIT');
    return this.flush();
  }

  onEvent(listener: BattleEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Can `playerId` use ability `abilityIndex` (0-2) of their active battle pet right now? */
  canCastSkill(playerId: PlayerId, abilityIndex = 0, petIndex?: number): Validation {
    if (this.status !== 'IN_PROGRESS') return { ok: false, reason: 'MATCH_NOT_IN_PROGRESS' };
    const player = this.players[playerId];
    if (!player) return { ok: false, reason: 'UNKNOWN_PLAYER' };
    if (petIndex !== undefined && petIndex !== player.activeIndex) return { ok: false, reason: 'WRONG_PET' };
    const pet = this.activePet(player);
    const ability = pet.abilities[abilityIndex];
    const skill = ability?.skill;
    if (pet.ko) return { ok: false, reason: 'PET_KO' };
    if (!skill) return { ok: false, reason: 'NO_ACTIVE_SKILL' };
    if (player.swapCooldownMs > 0) return { ok: false, reason: 'SWAP_LOCK' };
    if (pet.statuses.some((s) => s.type === 'STUN')) return { ok: false, reason: 'STUNNED' };
    if (pet.statuses.some((s) => s.rule.blocksSkill)) return { ok: false, reason: 'SILENCED' };
    if (player.globalCooldownMs > 0) return { ok: false, reason: 'GLOBAL_COOLDOWN' };
    if (ability.cooldownMs > 0) return { ok: false, reason: 'ON_COOLDOWN' };
    if (ability.usesLeft <= 0) return { ok: false, reason: 'NO_USES_LEFT' };
    if (skill.effects.some((e) => e.kind === 'revivePartner') && !this.reservePet(player).ko) {
      return { ok: false, reason: 'NO_VALID_TARGET' };
    }
    return { ok: true };
  }

  canSwap(playerId: PlayerId): Validation {
    if (this.status !== 'IN_PROGRESS') return { ok: false, reason: 'MATCH_NOT_IN_PROGRESS' };
    const player = this.players[playerId];
    if (!player) return { ok: false, reason: 'UNKNOWN_PLAYER' };
    const active = this.activePet(player);
    if (this.reservePet(player).ko) return { ok: false, reason: 'RESERVE_KO' };
    if (player.swapCooldownMs > 0) return { ok: false, reason: 'SWAP_LOCK' };
    if (active.has('STUN')) return { ok: false, reason: 'STUNNED' };
    if (active.statuses.some((s) => s.rule.blocksSwap)) return { ok: false, reason: 'ROOTED' };
    return { ok: true };
  }

  get activeWeather(): WeatherType | null {
    return this.weather?.def.type ?? null;
  }

  activePet(player: PlayerState | PlayerId): PetState {
    const p = typeof player === 'string' ? this.players[player] : player;
    return p.pets[p.activeIndex];
  }

  reservePet(player: PlayerState | PlayerId): PetState {
    const p = typeof player === 'string' ? this.players[player] : player;
    return p.pets[p.activeIndex === 0 ? 1 : 0];
  }

  /**
   * Server state in the PRD 5.1 shape, ready to broadcast as BATTLE_TICK_UPDATE.
   * With `viewer`, statuses the opponent must not see (Decoy) are left out of
   * the other player's pets; without it the full state is returned (replays, tests).
   */
  getState(viewer?: PlayerId): GameStateSnapshot {
    const state = this.fullState();
    return viewer ? redactState(state, viewer) : state;
  }

  private fullState(): GameStateSnapshot {
    const statusSnap = (s: StatusEffect): StatusSnapshot => {
      const snap: StatusSnapshot = {
        type: s.label,
        status: s.type,
        duration: Number.isFinite(s.remainingMs) ? toSec(s.remainingMs) : null,
      };
      if (s.stacks > 1) snap.stacks = s.stacks;
      if (s.value) snap.value = s.value;
      if ((s.type === 'DOT' || s.type === 'HOT') && s.intervalMs > 0) snap.dps = (s.value * 1000) / s.intervalMs;
      return snap;
    };
    const petSnap = (pet: PetState): PetSnapshot => ({
      id: pet.id,
      name: pet.name,
      element: pet.element,
      max_hp: pet.maxHp,
      current_hp: pet.hp,
      is_ko: pet.ko,
      abilities: pet.abilities.map((a) => ({
        name: a.name,
        pet_id: a.source.id,
        element: a.source.element,
        is_passive: !a.skill,
        cooldown_remaining: toSec(a.cooldownMs),
        uses_left: Number.isFinite(a.usesLeft) ? a.usesLeft : null,
      })),
      charges: pet.charges,
      active_buffs: pet.statuses.filter((s) => s.polarity === 'BUFF').map(statusSnap),
      active_debuffs: pet.statuses.filter((s) => s.polarity === 'DEBUFF').map(statusSnap),
    });
    const w = this.weather;
    return {
      match_id: this.matchId,
      status: this.status,
      tick: this.tickCount,
      elapsed_sec: toSec(this.elapsedMs),
      active_weather: w
        ? {
            type: w.def.type,
            name: w.def.name,
            duration_remaining: toSec(w.remainingMs),
            effect_tick_sec: w.def.tick ? w.def.tick.intervalMs / 1000 : null,
            damage_per_tick: w.def.tick?.damage ?? null,
          }
        : null,
      winner: this.winner,
      players: {
        p1: this.playerSnap(this.players.p1, petSnap),
        p2: this.playerSnap(this.players.p2, petSnap),
      },
    };
  }

  // =========================================================================
  // Commands
  // =========================================================================

  private executeCommand(command: Command): void {
    const player = this.players[command.playerId];
    if (!player) return;
    const check =
      command.type === 'CAST_SKILL'
        ? this.canCastSkill(command.playerId, command.abilityIndex ?? 0, command.petIndex)
        : this.canSwap(command.playerId);
    if (!check.ok) {
      if (!this.wasValidWhenIssued(command, check.reason)) {
        this.emit({ type: 'ACTION_REJECTED', player: player.id, action: command.type, reason: check.reason });
        return;
      }
      this.emit({
        type: 'LAG_COMPENSATED',
        player: player.id,
        action: command.type,
        reason: check.reason,
        lagMs: Math.round(this.elapsedMs - command.atMs!),
      });
    }
    player.lastActionAtMs = this.elapsedMs;
    if (command.type === 'CAST_SKILL') {
      const pet = this.activePet(player);
      this.castSkill(pet, pet.abilities[command.abilityIndex ?? 0], player, null);
    } else {
      this.swap(player, 'PLAYER');
    }
  }

  /**
   * Favour-the-acting-player lag compensation: if the action is blocked only by
   * something that happened after the player pressed (a stun, silence, root or
   * cooldown extension landing in flight), and it was valid at that moment for
   * the same active pet, it is honoured. Bounded by `lagCompensationMs`.
   */
  private wasValidWhenIssued(command: Command, reason: RejectReason): boolean {
    if (command.atMs === undefined || !COMPENSABLE.has(reason)) return false;
    const lag = this.elapsedMs - command.atMs;
    if (lag <= 0 || lag > this.lagCompensationMs) return false;
    const record = this.validityAt(command.atMs);
    if (!record) return false;
    const past = record.players[command.playerId];
    const player = this.players[command.playerId];
    // Any own action since that snapshot (e.g. a double-press) makes it stale:
    // compensation only ever forgives the opponent's interference.
    if (player.lastActionAtMs !== null && player.lastActionAtMs >= record.t) return false;
    if (past.active !== player.activeIndex || this.activePet(player).ko) return false;
    return command.type === 'CAST_SKILL' ? past.cast[command.abilityIndex ?? 0]?.ok === true : past.swap.ok;
  }

  private recordValidity(): void {
    if (this.lagCompensationMs <= 0) return;
    const snap = (id: PlayerId) => ({
      active: this.players[id].activeIndex,
      cast: this.activePet(id).abilities.map((_, i) => this.canCastSkill(id, i)),
      swap: this.canSwap(id),
    });
    this.history.push({ t: this.elapsedMs, players: { p1: snap('p1'), p2: snap('p2') } });
    const keep = 2 * (Math.ceil(this.lagCompensationMs / TICK_MS) + 2);
    if (this.history.length > keep) this.history.splice(0, this.history.length - keep);
  }

  /** Latest validity record at or before match time `t`. */
  private validityAt(t: number): ValidityRecord | null {
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].t <= t) return this.history[i];
    return null;
  }

  // =========================================================================
  // Skill resolution
  // =========================================================================

  /** `possessor` set = forced reversed cast (Possession): no cooldown, no use consumed. */
  private castSkill(actor: PetState, ability: AbilityState, owner: PlayerState, possessor: PlayerState | null): void {
    const skill = ability.skill;
    if (!skill) return;
    if (!possessor) {
      ability.cooldownMs = this.effectiveCooldownMs(actor, ability);
      ability.usesLeft--;
      owner.globalCooldownMs = GLOBAL_COOLDOWN_MS;
    }
    this.emit({ type: 'SKILL_CAST', actor: actor.ref, abilityIndex: ability.index, skill: skill.name, possessedBy: possessor?.id ?? null });

    const ctx: CastContext = possessor
      ? { actor, ability, ally: possessor, foe: owner, reversed: true, landed: null }
      : { actor, ability, ally: owner, foe: this.opponent(owner), reversed: false, landed: null };

    for (const effect of skill.effects) {
      if (this.status !== 'IN_PROGRESS') break;
      if (ctx.landed === false && this.targetsFoe(effect)) continue;
      this.runEffect(ctx, effect);
    }
  }

  private effectiveCooldownMs(pet: PetState, ability: AbilityState): number {
    let sec = ability.skill!.cooldownSec;
    for (const mate of this.players[pet.owner].pets) {
      for (const p of mate.passives('cooldownReduction')) {
        if (mate === pet || p.includePartner) sec = Math.max(p.minSec, sec - p.seconds);
      }
    }
    sec += this.weather?.def.cooldownPenaltySec ?? 0;
    return Math.round(sec * 1000);
  }

  /** Riders aimed at the enemy only apply if the attack before them connected. */
  private targetsFoe(effect: SkillEffect): boolean {
    switch (effect.kind) {
      case 'status':
      case 'purgeBuffs':
        return effect.target === 'enemy';
      case 'forceSwap':
      case 'extendEnemyCooldowns':
        return true;
      default:
        return false;
    }
  }

  private resolveTarget(ctx: CastContext, target: EffectTarget): PetState | null {
    let pet: PetState;
    if (target === 'self') pet = ctx.reversed ? this.activePet(ctx.ally) : ctx.actor;
    else if (target === 'enemy') pet = this.activePet(ctx.foe);
    else pet = this.reservePet(ctx.ally);
    return pet.ko ? null : pet;
  }

  private runEffect(ctx: CastContext, effect: SkillEffect): void {
    switch (effect.kind) {
      case 'damage':
        this.performAttack(ctx, effect);
        return;

      case 'status': {
        const target = this.resolveTarget(ctx, effect.target);
        if (!target) return;
        this.applyStatus(target, {
          type: effect.status,
          label: effect.label,
          durationMs: this.roll(effect.durationSec) * 1000,
          value: effect.value,
          intervalMs: effect.intervalSec !== undefined ? effect.intervalSec * 1000 : undefined,
          maxStacks: effect.maxStacks,
          element: effect.element,
          consumeOnTrigger: effect.consumeOnTrigger,
          reflectPct: effect.reflectPct,
          source: ctx.actor.owner,
        });
        return;
      }

      case 'heal': {
        const target = this.resolveTarget(ctx, effect.target);
        if (target) this.heal(target, effect.amount);
        return;
      }

      case 'recoil':
        this.dealDamage(ctx.actor, effect.amount, { source: 'RECOIL' });
        return;

      case 'forceSwap':
        if (!this.activePet(ctx.foe).ko) this.swap(ctx.foe, 'FORCED');
        return;

      case 'purgeBuffs': {
        const target = this.resolveTarget(ctx, effect.target);
        if (!target) return;
        for (const s of target.statuses.filter((x) => x.polarity === 'BUFF')) this.removeStatus(target, s, 'PURGED');
        return;
      }

      case 'mindSwap': {
        const self = this.resolveTarget(ctx, 'self');
        const enemy = this.resolveTarget(ctx, 'enemy');
        if (!self || !enemy || self === enemy) return;
        const stolen = enemy.statuses.filter((s) => s.polarity === 'BUFF');
        const given = self.statuses.filter((s) => s.polarity === 'DEBUFF');
        for (const s of stolen) this.moveStatus(enemy, self, s, 'STOLEN');
        for (const s of given) this.moveStatus(self, enemy, s, 'TRANSFERRED');
        return;
      }

      case 'extendEnemyCooldowns':
        for (const pet of ctx.foe.pets) {
          if (pet.ko) continue;
          const recharging = pet.abilities.filter((a) => a.cooldownMs > 0);
          for (const a of recharging) a.cooldownMs += effect.seconds * 1000;
          if (recharging.length) this.emit({ type: 'COOLDOWN_EXTENDED', target: pet.ref, seconds: effect.seconds });
        }
        return;

      case 'weather':
        this.startWeather(effect.weather, effect.durationSec, ctx.actor.owner);
        return;

      case 'revivePartner': {
        const partner = this.reservePet(ctx.ally);
        if (!partner.ko) {
          this.emit({ type: 'SKILL_FIZZLED', actor: ctx.actor.ref, skill: ctx.ability.name, reason: 'NO_KO_PARTNER' });
          return;
        }
        partner.ko = false;
        partner.hp = Math.max(1, Math.round(partner.maxHp * effect.hpPct));
        this.emit({ type: 'REVIVE', target: partner.ref, hp: partner.hp, cause: 'WISH' });
        return;
      }

      case 'possession': {
        if (ctx.reversed) return;
        // "Forces the target to use a random skill on the wrong target."
        const victim = this.activePet(ctx.foe);
        const candidates = victim.ko
          ? []
          : victim.abilities.filter((a) => a.skill && !a.skill.effects.some((e) => e.kind === 'possession'));
        if (!candidates.length) {
          this.emit({ type: 'SKILL_FIZZLED', actor: ctx.actor.ref, skill: ctx.ability.name, reason: 'NO_POSSESSABLE_SKILL' });
          return;
        }
        this.castSkill(victim, this.rng.pick(candidates), ctx.foe, ctx.ally);
        return;
      }

      case 'randomBuff': {
        const target = this.resolveTarget(ctx, 'self');
        if (target) this.applyStatus(target, { ...this.rng.pick(RANDOM_BUFFS), source: ctx.actor.owner });
        return;
      }

      case 'growtopianCycle': {
        const actor = ctx.actor;
        const cycle = ctx.ability;
        const step = cycle.cycleStep;
        cycle.cycleStep = (step + 1) % 3;
        if (step === 0) {
          this.emit({ type: 'SKILL_PHASE', actor: actor.ref, phase: 'PUNCH', stacks: cycle.growStacks });
          this.performAttack(ctx, { kind: 'damage', amount: effect.punchDamage + effect.punchPerGrow * cycle.growStacks });
        } else if (step === 1) {
          this.emit({ type: 'SKILL_PHASE', actor: actor.ref, phase: 'BUILD', stacks: cycle.growStacks });
          const self = this.resolveTarget(ctx, 'self');
          if (self) {
            const sec = effect.buildBlockSec + effect.buildPerGrowSec * cycle.growStacks;
            this.applyStatus(self, { type: 'BLOCK', label: 'BUILD', durationMs: sec * 1000, source: actor.owner });
          }
        } else {
          cycle.growStacks = Math.min(effect.maxGrow, cycle.growStacks + 1);
          this.emit({ type: 'SKILL_PHASE', actor: actor.ref, phase: 'GROW', stacks: cycle.growStacks });
        }
        return;
      }
    }
  }

  // =========================================================================
  // Combat
  // =========================================================================

  private performAttack(ctx: CastContext, eff: DamageEffect): void {
    const attacker = ctx.actor;
    const target = this.activePet(ctx.foe);
    if (target.ko) {
      ctx.landed = false;
      return;
    }

    let base = this.roll(eff.amount);
    if (eff.perCharge !== undefined) {
      base = attacker.charges * eff.perCharge;
      attacker.charges = 0;
    }
    if (eff.perConsumedBuff !== undefined) {
      const buffs = attacker.statuses.filter((s) => s.polarity === 'BUFF');
      for (const b of buffs) this.removeStatus(attacker, b, 'CONSUMED');
      base += buffs.length * eff.perConsumedBuff;
    }
    if (eff.perEnemyDebuff !== undefined && !target.ko) {
      base += target.statuses.filter((s) => s.polarity === 'DEBUFF').length * eff.perEnemyDebuff;
    }
    // An ability hits with the element of the pet it was spliced from.
    const element: Element = eff.element === 'RANDOM' ? this.rng.pick(ELEMENTS) : (eff.element ?? ctx.ability.source.element);
    const selfHit = target === attacker;

    // 1. Self Sacrifice decoy beats everything, including Undodgeable.
    const decoy = selfHit ? undefined : target.find('DECOY');
    if (decoy) {
      ctx.landed = false;
      this.removeStatus(target, decoy, 'CONSUMED');
      this.emit({ type: 'MISS', target: target.ref, attacker: attacker.ref, reason: 'DECOY' });
      // The smoke always grants Dodge: to the partner that comes in, or to the
      // decoy pet itself when there is no partner left to swap to.
      this.swap(ctx.foe, 'DECOY');
      this.applyStatus(this.activePet(ctx.foe), {
        type: 'DODGE',
        label: 'SMOKE',
        durationMs: decoy.value * 1000,
        source: ctx.foe.id,
      });
      return;
    }

    // 2. Dodge / Block.
    const passiveDodge = target.passives('dodgeChance').some((p) => this.rng.chance(p.chance));
    const dodging = target.has('DODGE') || passiveDodge;
    const blocking = target.has('BLOCK');
    const evadeAttempt = dodging || blocking || target.has('DAMAGE_REDUCTION');
    if (dodging && !eff.undodgeable) {
      ctx.landed = false;
      this.emit({ type: 'MISS', target: target.ref, attacker: attacker.ref, reason: 'DODGE' });
      return;
    }
    if (blocking && !eff.unblockable) {
      ctx.landed = false;
      this.emit({ type: 'MISS', target: target.ref, attacker: attacker.ref, reason: 'BLOCK' });
      return;
    }

    // 3. Multipliers.
    let skillBonus = 1;
    if (eff.bonusVsElement && target.element === eff.bonusVsElement.element) skillBonus += eff.bonusVsElement.pct;
    if (eff.bonusIfEvading && evadeAttempt) skillBonus += eff.bonusIfEvading;

    const critChance = Math.max(0, ...attacker.statuses.filter((s) => s.type === 'DOUBLE_DAMAGE_CHANCE').map((s) => s.value));
    const crit = critChance > 0 && this.rng.chance(critChance);

    let incoming = 1;
    const reduction = target.find('DAMAGE_REDUCTION');
    if (reduction && !eff.unblockable) incoming *= 1 - reduction.value;
    for (const p of target.passives('damageTakenReduction')) incoming *= 1 - p.pct;

    const amount = calculateDamage({
      base,
      elementMultiplier: getElementMultiplier(element, target.element),
      buffMultiplier: 1 + this.outgoingBonus(attacker, element),
      skillBonusMultiplier: skillBonus,
      critMultiplier: crit ? CRIT_MULTIPLIER : 1,
      incomingMultiplier: incoming,
    });

    for (const s of attacker.statuses.filter((x) => x.type === 'NEXT_ELEMENT_BOOST' && (!x.element || x.element === element))) {
      this.removeStatus(attacker, s, 'CONSUMED');
    }

    // 4. Apply, then on-hit reactions.
    ctx.landed = true;
    const thorns = selfHit ? undefined : target.find('THORNS');
    this.dealDamage(target, amount, { source: 'SKILL', element, crit, attacker: attacker.ref });
    if (thorns) {
      const reflected = thorns.value + Math.round(amount * thorns.reflectPct);
      if (reflected > 0) {
        this.dealDamage(attacker, reflected, { source: 'REFLECT', element: thorns.element, attacker: target.ref, label: thorns.label });
      }
      if (thorns.consumeOnTrigger && thorns.active) this.removeStatus(target, thorns, 'CONSUMED');
    }
  }

  private outgoingBonus(attacker: PetState, element: Element): number {
    let bonus = 0;
    for (const s of attacker.statuses) {
      if (s.type === 'DAMAGE_BOOST') bonus += s.value;
      else if (s.type === 'RAGE') bonus += s.value * s.stacks;
      else if (s.type === 'NEXT_ELEMENT_BOOST' && (!s.element || s.element === element)) bonus += s.value;
    }
    const boost = this.weather?.def.elementBoost;
    if (boost && boost.element === element) bonus += boost.pct;
    return bonus;
  }

  private dealDamage(pet: PetState, amount: number, meta: DamageMeta): void {
    if (pet.ko || amount <= 0) return;
    pet.hp = Math.max(0, pet.hp - amount);
    this.emit({ type: 'DAMAGE', target: pet.ref, amount, hp: pet.hp, ...meta });
    for (const p of pet.passives('chargeOnDamage')) pet.charges = Math.min(p.maxCharges, pet.charges + 1);
    if (pet.hp === 0) this.handleLethal(pet);
  }

  private handleLethal(pet: PetState): void {
    const rebirth = pet.find('REBIRTH');
    if (rebirth) {
      this.removeStatus(pet, rebirth, 'CONSUMED');
      pet.hp = Math.max(1, Math.round(pet.maxHp * rebirth.value));
      this.emit({ type: 'REVIVE', target: pet.ref, hp: pet.hp, cause: 'REBIRTH' });
      return;
    }
    pet.ko = true;
    pet.hp = 0;
    pet.charges = 0;
    for (const s of [...pet.statuses]) this.removeStatus(pet, s, 'KO');
    this.emit({ type: 'KO', target: pet.ref });
  }

  private heal(pet: PetState, amount: number, label?: string): void {
    if (pet.ko || amount <= 0) return;
    if (pet.has('TRAUMA')) {
      this.emit({ type: 'HEAL_PREVENTED', target: pet.ref });
      return;
    }
    const before = pet.hp;
    pet.hp = Math.min(pet.maxHp, pet.hp + amount);
    if (pet.hp > before) this.emit({ type: 'HEAL', target: pet.ref, amount: pet.hp - before, hp: pet.hp, label });
  }

  // =========================================================================
  // Status effect state machine
  // =========================================================================

  private applyStatus(pet: PetState, init: StatusInit, transferred = false): StatusEffect | null {
    if (pet.ko) return null;
    const rule = STATUS_RULES[init.type];
    const label = init.label ?? init.type;
    let durationMs = init.durationMs;

    if (!transferred && rule.polarity === 'DEBUFF' && Number.isFinite(durationMs)) {
      for (const p of pet.passives('debuffDurationReduction')) durationMs -= p.seconds * 1000;
      if (durationMs <= 0) {
        this.emit({ type: 'STATUS_RESISTED', target: pet.ref, status: init.type, label });
        return null;
      }
    }

    if (rule.stacking !== 'independent') {
      const existing = pet.statuses.find((s) => s.type === init.type && s.label === label);
      if (existing) {
        existing.reapply(durationMs, init.value);
        this.emit({
          type: 'STATUS_REFRESHED',
          target: pet.ref,
          status: existing.type,
          label,
          durationSec: Number.isFinite(existing.remainingMs) ? existing.remainingMs / 1000 : null,
          stacks: existing.stacks,
        });
        return existing;
      }
    }

    const status = new StatusEffect(this.nextUid++, { ...init, durationMs });
    pet.statuses.push(status);
    this.emit({
      type: 'STATUS_APPLIED',
      target: pet.ref,
      status: status.type,
      label,
      durationSec: Number.isFinite(durationMs) ? durationMs / 1000 : null,
      stacks: status.stacks,
    });
    return status;
  }

  private removeStatus(pet: PetState, status: StatusEffect, reason: StatusEndReason): void {
    if (!status.active) return;
    status.end(reason);
    const i = pet.statuses.indexOf(status);
    if (i >= 0) pet.statuses.splice(i, 1);
    this.emit({ type: 'STATUS_REMOVED', target: pet.ref, status: status.type, label: status.label, reason });
  }

  /** Mind Swap: end the status on `from` and start an identical copy on `to`. */
  private moveStatus(from: PetState, to: PetState, status: StatusEffect, reason: 'STOLEN' | 'TRANSFERRED'): void {
    this.removeStatus(from, status, reason);
    const copy = this.applyStatus(
      to,
      {
        type: status.type,
        label: status.label,
        durationMs: status.remainingMs,
        value: status.value,
        intervalMs: status.intervalMs || undefined,
        maxStacks: status.maxStacks,
        element: status.element,
        consumeOnTrigger: status.consumeOnTrigger,
        reflectPct: status.reflectPct,
        source: status.source,
      },
      true,
    );
    if (copy) {
      copy.stacks = Math.max(copy.stacks, status.stacks);
      copy.tickAccumMs = status.tickAccumMs;
    }
  }

  private onStatusTick(pet: PetState, status: StatusEffect): void {
    if (status.type === 'DOT') this.dealDamage(pet, status.value, { source: 'DOT', element: status.element, label: status.label });
    else if (status.type === 'HOT') this.heal(pet, status.value, status.label);
  }

  private onStatusExpired(pet: PetState, status: StatusEffect): void {
    if (status.type === 'DOOM') this.dealDamage(pet, pet.hp, { source: 'DOOM', label: status.label });
  }

  // =========================================================================
  // Swap, weather, KO, time
  // =========================================================================

  private swap(player: PlayerState, cause: SwapCause): boolean {
    const from = player.activeIndex;
    const to: 0 | 1 = from === 0 ? 1 : 0;
    const outgoing = player.pets[from];
    const incoming = player.pets[to];
    if (incoming.ko) return false;

    const punish = outgoing.find('SWAP_PUNISH');
    for (const s of outgoing.statuses.filter((x) => x.rule.clearOnSwapOut)) this.removeStatus(outgoing, s, 'SWAP_OUT');
    outgoing.regenAccumMs = 0;
    player.activeIndex = to;
    // Windspeed (Summer Kite) removes the 1.5s swap lock, but only for the battle
    // pet that carries it: swapping into a pet without Windspeed is locked as usual.
    const noLock = incoming.passives('noSwapCooldown').length > 0;
    player.swapCooldownMs = noLock ? 0 : SWAP_COOLDOWN_MS;
    this.emit({ type: 'SWAP', player: player.id, from, to, cause });

    if (punish) {
      this.dealDamage(outgoing, punish.value, { source: 'SWAP_PUNISH', label: punish.label });
      this.dealDamage(incoming, punish.value, { source: 'SWAP_PUNISH', label: punish.label });
    }
    return true;
  }

  /** Only one weather can be active; a new one replaces the old. */
  private startWeather(type: WeatherType, durationSec: number, source: PlayerId): void {
    if (this.weather) {
      const old = this.weather.def;
      this.emit({ type: 'WEATHER_END', weather: old.type, name: old.name, reason: 'REPLACED' });
    }
    const def = WEATHER_DEFS[type];
    this.weather = { def, durationMs: durationSec * 1000, remainingMs: durationSec * 1000, accumMs: 0, source };
    this.emit({ type: 'WEATHER_START', weather: type, name: def.name, durationSec, source });
    if (def.onStartStun) {
      for (const player of this.allPlayers()) {
        const pet = this.activePet(player);
        if (!pet.ko) {
          this.applyStatus(pet, { type: 'STUN', label: def.onStartStun.label, durationMs: def.onStartStun.durationSec * 1000, source });
        }
      }
    }
  }

  private advanceTime(dt: number): void {
    this.elapsedMs += dt;

    for (const player of this.allPlayers()) {
      // Mud slows every timer of the team it sits on, not only skill cooldowns:
      // the swap lock and the global cooldown recover just as slowly.
      const teamSlow = Math.max(1, ...player.pets.filter((p) => !p.ko).map((p) => p.find('COOLDOWN_SLOW')?.value ?? 1));
      player.swapCooldownMs = Math.max(0, player.swapCooldownMs - dt / teamSlow);
      player.globalCooldownMs = Math.max(0, player.globalCooldownMs - dt / teamSlow);
      const active = this.activePet(player);
      for (const pet of player.pets) {
        if (pet.ko) continue;

        // Mud: the whole team recharges `value` times slower. Sugar Rush: this pet `value` times faster.
        const haste = pet.find('COOLDOWN_HASTE')?.value ?? 1;
        const step = (dt * haste) / teamSlow;
        for (const a of pet.abilities) {
          if (a.cooldownMs > 0) a.cooldownMs = Math.max(0, a.cooldownMs - step);
        }

        const regen = pet.passives('reserveRegen')[0];
        if (regen && pet !== active) {
          pet.regenAccumMs += dt;
          while (pet.regenAccumMs >= regen.intervalSec * 1000) {
            pet.regenAccumMs -= regen.intervalSec * 1000;
            this.heal(pet, regen.amount, 'REGEN');
          }
        }

        for (const s of [...pet.statuses]) {
          if (!s.active) continue;
          // Sugar Rush shakes off Count Sheep's sleep `haste` times faster.
          const fired = s.advance(s.type === 'STUN' && s.label === 'SLEEP' ? dt * haste : dt);
          for (let i = 0; i < fired && s.active && !pet.ko; i++) this.onStatusTick(pet, s);
          if (s.active && s.expired) {
            this.removeStatus(pet, s, 'EXPIRED');
            this.onStatusExpired(pet, s);
          }
          if (pet.ko) break;
        }
      }
    }

    this.advanceWeather(dt);
  }

  private advanceWeather(dt: number): void {
    const w = this.weather;
    if (!w) return;
    w.remainingMs -= dt;
    const tick = w.def.tick;
    if (tick) {
      w.accumMs += dt;
      while (w.accumMs >= tick.intervalMs) {
        w.accumMs -= tick.intervalMs;
        for (const player of this.allPlayers()) {
          this.dealDamage(this.activePet(player), tick.damage, { source: 'WEATHER', element: tick.element, label: w.def.name });
        }
      }
    }
    if (w.remainingMs <= 0) {
      this.weather = null;
      this.emit({ type: 'WEATHER_END', weather: w.def.type, name: w.def.name, reason: 'EXPIRED' });
    }
  }

  /** KO'd active pets are replaced by the reserve; a player with no pets left loses. */
  private resolveKnockouts(): void {
    if (this.status !== 'IN_PROGRESS') return;
    for (const player of this.allPlayers()) {
      if (this.activePet(player).ko && !this.reservePet(player).ko) this.swap(player, 'KO');
    }
    const lost = this.allPlayers().filter((p) => p.pets.every((pet) => pet.ko));
    if (lost.length === 2) this.finish('DRAW', 'KO');
    else if (lost.length === 1) this.finish(this.opponent(lost[0]).id, 'KO');
  }

  private finish(winner: PlayerId | 'DRAW', reason: MatchEndReason): void {
    this.status = 'FINISHED';
    this.winner = winner;
    this.endReason = reason;
    this.queue = [];
    this.emit({ type: 'MATCH_END', winner, reason });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private roll(value: NumberOrRange): number {
    return typeof value === 'number' ? value : this.rng.int(value.min, value.max);
  }

  private opponent(player: PlayerState): PlayerState {
    return this.players[player.id === 'p1' ? 'p2' : 'p1'];
  }

  private allPlayers(): PlayerState[] {
    return PLAYER_IDS.map((id) => this.players[id]);
  }

  private playerSnap(player: PlayerState, petSnap: (pet: PetState) => PetSnapshot) {
    return {
      user_id: player.userId,
      active_pet_index: player.activeIndex,
      swap_cooldown_remaining: toSec(player.swapCooldownMs),
      global_cooldown_remaining: toSec(player.globalCooldownMs),
      pets: player.pets.map(petSnap),
    };
  }

  private emit(body: BattleEventBody): void {
    const event = { ...body, t: this.elapsedMs, tick: this.tickCount } as BattleEvent;
    this.pending.push(event);
    for (const listener of this.listeners) listener(event);
  }

  private flush(): BattleEvent[] {
    return this.pending.splice(0);
  }
}
