/** Server tick rate (PRD 3.1: 20Hz / 50ms per tick). */
export const TICK_RATE_HZ = 20;
export const TICK_MS = 1000 / TICK_RATE_HZ;

/** Global swap cooldown (PRD 4.1: 1.5s before the new pet can act or swap again). */
export const SWAP_COOLDOWN_MS = 1_500;

/** Global cooldown: after any skill, the player cannot use another skill for 1s. */
export const GLOBAL_COOLDOWN_MS = 1_000;

/**
 * Base max HP. The database has no HP column; 150 is the PRD lower bound and
 * Mini Mammoth's +30% passive lands exactly on the PRD upper bound (195).
 */
export const DEFAULT_MAX_HP = 150;

/** Starting cooldown when a skill has no explicit "Cooldown Awal" (PRD 4.1: 50%). */
export const INITIAL_COOLDOWN_RATIO = 0.5;

/** Element advantage multipliers (PRD 4.1). */
export const ELEMENT_ADVANTAGE_MULTIPLIER = 1.25;
export const ELEMENT_DISADVANTAGE_MULTIPLIER = 0.75;

/** Multiplier applied when a Double Damage chance procs. */
export const CRIT_MULTIPLIER = 2;
