import type { Element } from './elements.ts';

export type PlayerId = 'p1' | 'p2';
export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

export interface Range {
  min: number;
  max: number;
}
export type NumberOrRange = number | Range;

/** Targets are resolved from the caster's point of view (and flipped under Possession). */
export type EffectTarget = 'self' | 'enemy' | 'partner';

export type Polarity = 'BUFF' | 'DEBUFF';

export type StatusType =
  // crowd control
  | 'STUN' // no skill, no swap (Stun / Freeze / Sleep)
  | 'SILENCE' // no skill, swap allowed (Enthrall, Just Dance)
  | 'ROOT' // swap locked (Bubble Trap, Sticky Pineapple Web)
  // defensive
  | 'DODGE' // evades everything except Undodgeable
  | 'BLOCK' // blocks everything except Unblockable
  | 'DAMAGE_REDUCTION' // partial block, value = fraction removed (Shell Defense)
  | 'THORNS' // reflects `value` damage to the attacker
  | 'DECOY' // Self Sacrifice: evade next hit, swap out, partner gets Dodge
  | 'REBIRTH' // revive at `value` fraction of max HP when KO'd
  // over time
  | 'DOT' // `value` damage every `interval`
  | 'HOT' // `value` heal every `interval`
  | 'TRAUMA' // heals are prevented
  // offense
  | 'DAMAGE_BOOST' // +value outgoing damage
  | 'RAGE' // +value outgoing damage per stack
  | 'NEXT_ELEMENT_BOOST' // +value on the next attack of `element`, then consumed
  | 'DOUBLE_DAMAGE_CHANCE' // `value` probability of a x2 hit
  // misc
  | 'COOLDOWN_SLOW' // cooldowns recover `value` times slower
  | 'COOLDOWN_HASTE' // cooldowns recover `value` times faster (Sugar Rush)
  | 'DOOM' // KO when it expires; cleared by swapping out
  | 'SWAP_PUNISH'; // Lockjaw: if the pet swaps out, it and its partner take `value`

export type WeatherType = 'TOXIC_CLOUD' | 'COUNT_SHEEP' | 'HEAT_WAVE' | 'HAILSTORM';

// ---------------------------------------------------------------------------
// Skill effect DSL
// ---------------------------------------------------------------------------

export interface DamageEffect {
  kind: 'damage';
  amount: NumberOrRange;
  /** Attack element; defaults to the attacker's element. 'RANDOM' = Taste The Rainbow. */
  element?: Element | 'RANDOM';
  unblockable?: boolean;
  undodgeable?: boolean;
  /** Dino line: extra damage against one element. */
  bonusVsElement?: { element: Element; pct: number };
  /** Precision/Critical line: extra damage if the target is dodging or blocking. */
  bonusIfEvading?: number;
  /** Pollen Barrage: consume all own buffs, + this much base damage per buff. */
  perConsumedBuff?: number;
  /** Static Charge: base damage = charges x this; charges reset. */
  perCharge?: number;
  /** Unearthly Beam: + this much base damage per debuff sitting on the target. */
  perEnemyDebuff?: number;
}

export interface ApplyStatusEffect {
  kind: 'status';
  target: EffectTarget;
  status: StatusType;
  durationSec: NumberOrRange;
  value?: number;
  intervalSec?: number;
  maxStacks?: number;
  element?: Element;
  consumeOnTrigger?: boolean;
  /** THORNS only: also reflect this fraction of the incoming hit (Diamond Shield). */
  reflectPct?: number;
  /** Display name for UI/state (BURN, FREEZE, SLEEP...). Defaults to the status type. */
  label?: string;
}

export type SkillEffect =
  | DamageEffect
  | ApplyStatusEffect
  | { kind: 'heal'; target: EffectTarget; amount: number }
  | { kind: 'recoil'; amount: number }
  | { kind: 'forceSwap' }
  | { kind: 'purgeBuffs'; target: EffectTarget }
  | { kind: 'mindSwap' }
  | { kind: 'extendEnemyCooldowns'; seconds: number }
  | { kind: 'weather'; weather: WeatherType; durationSec: number }
  | { kind: 'revivePartner'; hpPct: number }
  | { kind: 'possession' }
  /** Hit by Inspiration: grants the caster one random buff from a fixed pool. */
  | { kind: 'randomBuff' }
  | {
      kind: 'growtopianCycle';
      punchDamage: number;
      punchPerGrow: number;
      buildBlockSec: number;
      buildPerGrowSec: number;
      maxGrow: number;
    };

export interface SkillDefinition {
  name: string;
  cooldownSec: number;
  /** "Cooldown Awal" from the database; defaults to 50% of cooldownSec. */
  initialCooldownSec?: number;
  usesPerBattle?: number;
  effects: readonly SkillEffect[];
}

export type PassiveDefinition =
  | { kind: 'dodgeChance'; chance: number }
  | { kind: 'cooldownReduction'; seconds: number; minSec: number; includePartner: boolean }
  /** Swapping INTO this battle pet does not start the 1.5s swap lock (Windspeed). */
  | { kind: 'noSwapCooldown' }
  | { kind: 'reserveRegen'; amount: number; intervalSec: number }
  | { kind: 'debuffDurationReduction'; seconds: number }
  | { kind: 'maxHpBonus'; pct: number }
  | { kind: 'damageTakenReduction'; pct: number }
  | { kind: 'chargeOnDamage'; maxCharges: number };

export type PassiveKind = PassiveDefinition['kind'];

export interface PetDefinition {
  id: string;
  /** Row number ("No") in growtopia_pet_battle_database.xlsx. */
  no?: number;
  name: string;
  element: Element;
  /** Ability name shown in UI (skill or passive). */
  ability: string;
  maxHp?: number;
  /** Absent for passive-only pets. */
  skill?: SkillDefinition;
  passives?: readonly PassiveDefinition[];
}

// ---------------------------------------------------------------------------
// Commands (client -> server)
// ---------------------------------------------------------------------------

/**
 * `atMs` = match time (ms since start) at which the player issued the input,
 * as estimated by the server from the client's clock-synced timestamp.
 * It drives lag compensation; omitted = "now".
 */
export type Command =
  | { type: 'CAST_SKILL'; playerId: PlayerId; abilityIndex?: number; petIndex?: number; timestamp?: number; atMs?: number }
  | { type: 'SWAP_PET'; playerId: PlayerId; timestamp?: number; atMs?: number };

export type CommandType = Command['type'];

/** Everything needed to re-simulate a match exactly: commands in processing order. */
export type LoggedCommand =
  | { tick: number; command: Command }
  | { tick: number; command: { type: 'FORFEIT'; playerId: PlayerId } };

export type RejectReason =
  | 'MATCH_NOT_IN_PROGRESS'
  | 'UNKNOWN_PLAYER'
  | 'WRONG_PET'
  | 'PET_KO'
  | 'NO_ACTIVE_SKILL'
  | 'ON_COOLDOWN'
  | 'SWAP_LOCK'
  | 'GLOBAL_COOLDOWN'
  | 'STUNNED'
  | 'SILENCED'
  | 'ROOTED'
  | 'NO_USES_LEFT'
  | 'NO_VALID_TARGET'
  | 'RESERVE_KO';

export type Validation = { ok: true } | { ok: false; reason: RejectReason };

// ---------------------------------------------------------------------------
// Events (server -> client, used for floating combat text and the battle log)
// ---------------------------------------------------------------------------

export interface PetRef {
  player: PlayerId;
  petIndex: number;
}

export type DamageSource = 'SKILL' | 'DOT' | 'WEATHER' | 'REFLECT' | 'RECOIL' | 'SWAP_PUNISH' | 'DOOM';
export type MissReason = 'DODGE' | 'BLOCK' | 'DECOY';
export type StatusEndReason = 'EXPIRED' | 'CONSUMED' | 'PURGED' | 'STOLEN' | 'TRANSFERRED' | 'SWAP_OUT' | 'KO';
export type SwapCause = 'PLAYER' | 'FORCED' | 'KO' | 'DECOY';
/** A match has no timer: it ends when one side has no pet standing, or a player gives up. */
export type MatchEndReason = 'KO' | 'FORFEIT';

export type BattleEventBody =
  | { type: 'MATCH_START' }
  | { type: 'MATCH_END'; winner: PlayerId | 'DRAW'; reason: MatchEndReason }
  | { type: 'ACTION_REJECTED'; player: PlayerId; action: CommandType; reason: RejectReason }
  /** The action was valid when the player pressed it; it is honoured despite `reason` now. */
  | { type: 'LAG_COMPENSATED'; player: PlayerId; action: CommandType; reason: RejectReason; lagMs: number }
  | { type: 'SKILL_CAST'; actor: PetRef; abilityIndex: number; skill: string; possessedBy: PlayerId | null }
  | { type: 'SKILL_FIZZLED'; actor: PetRef; skill: string; reason: string }
  | { type: 'SKILL_PHASE'; actor: PetRef; phase: string; stacks: number }
  | {
      type: 'DAMAGE';
      target: PetRef;
      amount: number;
      hp: number;
      source: DamageSource;
      element?: Element;
      crit?: boolean;
      attacker?: PetRef;
      label?: string;
    }
  | { type: 'HEAL'; target: PetRef; amount: number; hp: number; label?: string }
  | { type: 'HEAL_PREVENTED'; target: PetRef }
  | { type: 'MISS'; target: PetRef; attacker: PetRef; reason: MissReason }
  | { type: 'STATUS_APPLIED'; target: PetRef; status: StatusType; label: string; durationSec: number | null; stacks: number }
  | { type: 'STATUS_REFRESHED'; target: PetRef; status: StatusType; label: string; durationSec: number | null; stacks: number }
  | { type: 'STATUS_RESISTED'; target: PetRef; status: StatusType; label: string }
  | { type: 'STATUS_REMOVED'; target: PetRef; status: StatusType; label: string; reason: StatusEndReason }
  | { type: 'SWAP'; player: PlayerId; from: number; to: number; cause: SwapCause }
  | { type: 'KO'; target: PetRef }
  | { type: 'REVIVE'; target: PetRef; hp: number; cause: 'WISH' | 'REBIRTH' }
  | { type: 'COOLDOWN_EXTENDED'; target: PetRef; seconds: number }
  | { type: 'WEATHER_START'; weather: WeatherType; name: string; durationSec: number; source: PlayerId }
  | { type: 'WEATHER_END'; weather: WeatherType; name: string; reason: 'EXPIRED' | 'REPLACED' };

/** Every event carries the match clock (ms since start) and the tick it happened on. */
export type BattleEvent = BattleEventBody & { t: number; tick: number };

export interface TickResult {
  tick: number;
  events: BattleEvent[];
}

// ---------------------------------------------------------------------------
// State snapshot (PRD 5.1 Game State Object, snake_case for the wire)
// ---------------------------------------------------------------------------

export type MatchStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';

export interface StatusSnapshot {
  type: string;
  status: StatusType;
  /** Seconds remaining; null = until consumed. */
  duration: number | null;
  stacks?: number;
  value?: number;
  dps?: number;
}

export interface AbilitySnapshot {
  name: string;
  /** Pet the ability was spliced from. */
  pet_id: string;
  element: Element;
  is_passive: boolean;
  cooldown_remaining: number;
  /** null = unlimited. */
  uses_left: number | null;
}

/** A battle pet: base pet identity plus up to 3 spliced abilities. */
export interface PetSnapshot {
  id: string;
  name: string;
  element: Element;
  max_hp: number;
  current_hp: number;
  is_ko: boolean;
  abilities: AbilitySnapshot[];
  charges: number;
  active_buffs: StatusSnapshot[];
  active_debuffs: StatusSnapshot[];
}

export interface PlayerSnapshot {
  user_id: string;
  active_pet_index: number;
  swap_cooldown_remaining: number;
  /** Seconds left on the 1s global skill cooldown. */
  global_cooldown_remaining: number;
  pets: PetSnapshot[];
}

export interface WeatherSnapshot {
  type: WeatherType;
  name: string;
  duration_remaining: number;
  effect_tick_sec: number | null;
  damage_per_tick: number | null;
}

export interface GameStateSnapshot {
  match_id: string;
  status: MatchStatus;
  tick: number;
  /** Match clock, counting up (there is no time limit). */
  elapsed_sec: number;
  active_weather: WeatherSnapshot | null;
  winner: PlayerId | 'DRAW' | null;
  players: Record<PlayerId, PlayerSnapshot>;
}
