import { ELEMENT_ADVANTAGE_MULTIPLIER, ELEMENT_DISADVANTAGE_MULTIPLIER } from './constants.ts';

export const ELEMENTS = ['Air', 'Earth', 'Fire', 'Water'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Air > Earth > Fire > Water > Air (PRD 4.1). */
const BEATS: Record<Element, Element> = {
  Air: 'Earth',
  Earth: 'Fire',
  Fire: 'Water',
  Water: 'Air',
};

export function beats(attacker: Element, defender: Element): boolean {
  return BEATS[attacker] === defender;
}

export function getElementMultiplier(attacker: Element, defender: Element): number {
  if (beats(attacker, defender)) return ELEMENT_ADVANTAGE_MULTIPLIER;
  if (beats(defender, attacker)) return ELEMENT_DISADVANTAGE_MULTIPLIER;
  return 1;
}

/** ELEMENT_MATRIX[attacker][defender], identical to the PRD 4.2 table. */
export const ELEMENT_MATRIX: Readonly<Record<Element, Readonly<Record<Element, number>>>> =
  Object.fromEntries(
    ELEMENTS.map((att) => [att, Object.fromEntries(ELEMENTS.map((def) => [def, getElementMultiplier(att, def)]))]),
  ) as Record<Element, Record<Element, number>>;
