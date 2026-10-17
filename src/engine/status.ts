import type { Element } from './elements.ts';
import type { PlayerId, Polarity, StatusEndReason, StatusType } from './types.ts';

/**
 * Status effect state machine.
 *
 *   (apply) --> ACTIVE --(timer)------> EXPIRED
 *                  |  \--(trigger)----> CONSUMED   (Thorns, Decoy, Rebirth, Spicy boost...)
 *                  |  \--(purge)------> PURGED     (Hydro Splash)
 *                  |  \--(mind swap)--> STOLEN / TRANSFERRED
 *                  |  \--(swap out)---> SWAP_OUT   (Doom, Lockjaw mark)
 *                  \-----(pet KO)-----> KO
 *
 * While ACTIVE, re-applying the same status follows its stacking rule
 * (refresh duration, add a stack, or run as an independent instance).
 * Terminal states are final: an ended status can never become ACTIVE again.
 */
export type StatusLifecycle = 'ACTIVE' | StatusEndReason;

export type StackingRule = 'refresh' | 'stack' | 'independent';

export interface StatusRule {
  polarity: Polarity;
  stacking: StackingRule;
  blocksSkill: boolean;
  blocksSwap: boolean;
  clearOnSwapOut: boolean;
  /** Only the owner sees it: left out of the opponent's state and events (Decoy). */
  hiddenFromOpponent: boolean;
}

const rule = (polarity: Polarity, stacking: StackingRule, extra: Partial<StatusRule> = {}): StatusRule => ({
  polarity,
  stacking,
  blocksSkill: false,
  blocksSwap: false,
  clearOnSwapOut: false,
  hiddenFromOpponent: false,
  ...extra,
});

export const STATUS_RULES: Readonly<Record<StatusType, StatusRule>> = {
  STUN: rule('DEBUFF', 'refresh', { blocksSkill: true, blocksSwap: true }),
  SILENCE: rule('DEBUFF', 'refresh', { blocksSkill: true }),
  ROOT: rule('DEBUFF', 'refresh', { blocksSwap: true }),
  DODGE: rule('BUFF', 'refresh'),
  BLOCK: rule('BUFF', 'refresh'),
  DAMAGE_REDUCTION: rule('BUFF', 'refresh'),
  THORNS: rule('BUFF', 'refresh'),
  DECOY: rule('BUFF', 'refresh', { hiddenFromOpponent: true }),
  REBIRTH: rule('BUFF', 'refresh'),
  DOT: rule('DEBUFF', 'independent'),
  HOT: rule('BUFF', 'independent'),
  TRAUMA: rule('DEBUFF', 'refresh'),
  DAMAGE_BOOST: rule('BUFF', 'refresh'),
  RAGE: rule('BUFF', 'stack'),
  NEXT_ELEMENT_BOOST: rule('BUFF', 'refresh'),
  DOUBLE_DAMAGE_CHANCE: rule('BUFF', 'refresh'),
  COOLDOWN_SLOW: rule('DEBUFF', 'refresh'),
  COOLDOWN_HASTE: rule('BUFF', 'refresh'),
  DOOM: rule('DEBUFF', 'refresh', { clearOnSwapOut: true }),
  SWAP_PUNISH: rule('DEBUFF', 'refresh', { clearOnSwapOut: true }),
};

export interface StatusInit {
  type: StatusType;
  label?: string;
  /** Infinity = lasts until consumed. */
  durationMs: number;
  value?: number;
  intervalMs?: number;
  maxStacks?: number;
  element?: Element;
  consumeOnTrigger?: boolean;
  /** THORNS only: also reflect this fraction of the incoming hit. */
  reflectPct?: number;
  source: PlayerId | null;
}

export class StatusEffect {
  readonly uid: number;
  readonly type: StatusType;
  readonly label: string;
  readonly rule: StatusRule;
  readonly intervalMs: number;
  readonly maxStacks: number;
  readonly element: Element | undefined;
  readonly consumeOnTrigger: boolean;
  readonly reflectPct: number;
  readonly source: PlayerId | null;
  durationMs: number;
  remainingMs: number;
  value: number;
  stacks = 1;
  tickAccumMs = 0;
  lifecycle: StatusLifecycle = 'ACTIVE';

  constructor(uid: number, init: StatusInit) {
    this.uid = uid;
    this.type = init.type;
    this.label = init.label ?? init.type;
    this.rule = STATUS_RULES[init.type];
    this.durationMs = init.durationMs;
    this.remainingMs = init.durationMs;
    this.value = init.value ?? 0;
    this.intervalMs = init.intervalMs ?? 0;
    this.maxStacks = init.maxStacks ?? 1;
    this.element = init.element;
    this.consumeOnTrigger = init.consumeOnTrigger ?? false;
    this.reflectPct = init.reflectPct ?? 0;
    this.source = init.source;
  }

  get polarity(): Polarity {
    return this.rule.polarity;
  }

  get active(): boolean {
    return this.lifecycle === 'ACTIVE';
  }

  get expired(): boolean {
    return this.remainingMs <= 0;
  }

  /** Re-application while ACTIVE, following the stacking rule. */
  reapply(durationMs: number, value: number | undefined): void {
    this.assertActive('reapply');
    if (this.rule.stacking === 'stack') {
      this.stacks = Math.min(this.maxStacks, this.stacks + 1);
      this.remainingMs = durationMs;
    } else {
      this.remainingMs = Math.max(this.remainingMs, durationMs);
    }
    this.durationMs = Math.max(this.durationMs, durationMs);
    if (value !== undefined) this.value = value;
  }

  /** Advances the timer; returns how many periodic ticks (DoT/HoT) fired. */
  advance(dtMs: number): number {
    this.assertActive('advance');
    let fired = 0;
    if (this.intervalMs > 0) {
      this.tickAccumMs += dtMs;
      while (this.tickAccumMs >= this.intervalMs) {
        this.tickAccumMs -= this.intervalMs;
        fired++;
      }
    }
    this.remainingMs -= dtMs;
    return fired;
  }

  /** ACTIVE -> terminal state. */
  end(reason: StatusEndReason): void {
    this.assertActive(`end(${reason})`);
    this.lifecycle = reason;
  }

  private assertActive(op: string): void {
    if (this.lifecycle !== 'ACTIVE') {
      throw new Error(`Invalid status transition: ${op} on ${this.label}#${this.uid} in state ${this.lifecycle}`);
    }
  }
}
