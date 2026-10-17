import { DEFAULT_MAX_HP, INITIAL_COOLDOWN_RATIO } from './constants.ts';
import type { StatusEffect } from './status.ts';
import type { PassiveDefinition, PassiveKind, PetDefinition, PetRef, PlayerId, SkillDefinition, StatusType } from './types.ts';

/** Growtopia battle pets carry 3 abilities, gene-spliced from 3 pets onto the first one. */
export const ABILITIES_PER_BATTLE_PET = 3;

/**
 * A battle pet as configured for a match: its ability source pets, base pet
 * first. A single PetDefinition is accepted as a 1-ability battle pet (tests).
 */
export type BattlePetSpec = PetDefinition | readonly PetDefinition[];

export function abilitySources(spec: BattlePetSpec): readonly PetDefinition[] {
  return 'id' in spec ? [spec as PetDefinition] : (spec as readonly PetDefinition[]);
}

/** One ability slot: its own cooldown, use counter and cycle state. */
export class AbilityState {
  readonly index: number;
  /** The pet this ability was spliced from. */
  readonly source: PetDefinition;
  cooldownMs = 0;
  usesLeft = Infinity;
  /** Mini Growtopian Punch/Build/Grow cycle. */
  cycleStep = 0;
  growStacks = 0;

  constructor(source: PetDefinition, index: number) {
    this.source = source;
    this.index = index;
  }

  get skill(): SkillDefinition | undefined {
    return this.source.skill;
  }

  get name(): string {
    return this.source.ability;
  }

  reset(): void {
    const skill = this.skill;
    this.usesLeft = skill?.usesPerBattle ?? Infinity;
    this.cooldownMs = skill ? Math.round((skill.initialCooldownSec ?? skill.cooldownSec * INITIAL_COOLDOWN_RATIO) * 1000) : 0;
    this.cycleStep = 0;
    this.growStacks = 0;
  }
}

/** Runtime state of one battle pet inside a BattleSession. */
export class PetState {
  readonly owner: PlayerId;
  readonly index: number;
  readonly abilities: readonly AbilityState[];
  readonly maxHp: number;
  hp: number;
  ko = false;
  statuses: StatusEffect[] = [];
  /** Static Charge counter (charged by any damage taken). */
  charges = 0;
  /** Gift of Growganoth reserve-regen timer. */
  regenAccumMs = 0;
  private readonly allPassives: readonly PassiveDefinition[];

  constructor(spec: BattlePetSpec, owner: PlayerId, index: number) {
    const sources = abilitySources(spec);
    if (sources.length < 1 || sources.length > ABILITIES_PER_BATTLE_PET) {
      throw new Error(`A battle pet needs 1-${ABILITIES_PER_BATTLE_PET} abilities, got ${sources.length}`);
    }
    this.owner = owner;
    this.index = index;
    this.abilities = sources.map((s, i) => new AbilityState(s, i));
    this.allPassives = sources.flatMap((s) => s.passives ?? []);
    const hpBonus = this.passives('maxHpBonus').reduce((sum, p) => sum + p.pct, 0);
    this.maxHp = Math.round((sources[0].maxHp ?? DEFAULT_MAX_HP) * (1 + hpBonus));
    this.hp = this.maxHp;
  }

  /** The base pet (first splice slot) gives the battle pet its name, look and element. */
  get base(): PetDefinition {
    return this.abilities[0].source;
  }

  get id(): string {
    return this.base.id;
  }

  get name(): string {
    return this.base.name;
  }

  get element() {
    return this.base.element;
  }

  get ref(): PetRef {
    return { player: this.owner, petIndex: this.index };
  }

  /** Match start: instant full-HP reset (no Bandage system) and starting cooldowns. */
  resetForMatch(): void {
    this.hp = this.maxHp;
    this.ko = false;
    this.statuses = [];
    this.charges = 0;
    this.regenAccumMs = 0;
    for (const a of this.abilities) a.reset();
  }

  /** Passives from all three spliced pets apply to the battle pet. */
  passives<K extends PassiveKind>(kind: K): Extract<PassiveDefinition, { kind: K }>[] {
    return this.allPassives.filter((p): p is Extract<PassiveDefinition, { kind: K }> => p.kind === kind);
  }

  has(type: StatusType): boolean {
    return this.statuses.some((s) => s.type === type);
  }

  find(type: StatusType): StatusEffect | undefined {
    return this.statuses.find((s) => s.type === type);
  }
}
