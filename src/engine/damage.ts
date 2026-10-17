export interface DamageInput {
  base: number;
  elementMultiplier: number;
  /** 1 + sum of the attacker's outgoing boosts (Howl, Rage, Heat Wave, Spicy Ignite). */
  buffMultiplier: number;
  /** Skill-specific bonuses (Dino vs element, Precision vs evading target). */
  skillBonusMultiplier?: number;
  /** Double Damage proc. */
  critMultiplier?: number;
  /** Target-side reductions (Shell Defense, Stubborn). */
  incomingMultiplier?: number;
}

/**
 * PRD 4.1: Final Damage = Base Damage x Element Multiplier x Buff Multiplier,
 * extended with the per-skill and defender modifiers found in the pet database.
 */
export function calculateDamage(input: DamageInput): number {
  const raw =
    input.base *
    input.elementMultiplier *
    input.buffMultiplier *
    (input.skillBonusMultiplier ?? 1) *
    (input.critMultiplier ?? 1) *
    (input.incomingMultiplier ?? 1);
  return Math.max(0, Math.round(raw));
}
