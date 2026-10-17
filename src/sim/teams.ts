import { PET_ROSTER } from '../data/petRepository.ts';
import type { Element } from '../engine/elements.ts';
import type { Rng } from '../engine/rng.ts';
import type { BattlePetPick, TeamPick } from '../server/protocol.ts';

/** A random battle pet: 3 different pets, any mix of elements (base pet first). */
export function randomBattlePet(rng: Rng, baseElement?: Element): BattlePetPick {
  const base = baseElement ? rng.pick(PET_ROSTER.filter((p) => p.element === baseElement)) : rng.pick(PET_ROSTER);
  const first = rng.pick(PET_ROSTER.filter((p) => p.id !== base.id));
  const second = rng.pick(PET_ROSTER.filter((p) => p.id !== base.id && p.id !== first.id));
  return [base.id, first.id, second.id];
}

export function randomTeam(rng: Rng): TeamPick {
  return [randomBattlePet(rng), randomBattlePet(rng)];
}
