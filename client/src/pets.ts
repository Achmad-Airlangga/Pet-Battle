import type { Element, PetInfo } from './types.ts';

export interface ElementTheme {
  main: string;
  dark: string;
  glow: string;
  hue: number;
}

export const ELEMENT_THEME: Record<Element, ElementTheme> = {
  Air: { main: '#9fd4ff', dark: '#3d74b8', glow: '#eaf6ff', hue: 205 },
  Earth: { main: '#8fd16a', dark: '#4a7a2a', glow: '#e3ffcf', hue: 95 },
  Fire: { main: '#ff8a4c', dark: '#b33a12', glow: '#fff0b3', hue: 18 },
  Water: { main: '#4fa8ff', dark: '#1d4f9c', glow: '#cfe8ff', hue: 215 },
};

export const ELEMENT_LABEL: Record<Element, string> = { Air: 'Air', Earth: 'Earth', Fire: 'Fire', Water: 'Water' };

const ELEMENT_ORDER: readonly Element[] = ['Air', 'Earth', 'Fire', 'Water'];

let roster: PetInfo[] = [];
const byId = new Map<string, PetInfo>();

export async function loadRoster(): Promise<PetInfo[]> {
  const res = await fetch('/pets');
  if (!res.ok) throw new Error(`GET /pets failed (${res.status})`);
  const body = (await res.json()) as { pets: PetInfo[] };
  // The server lists the 170 sheet rows first and hand-added pets after them;
  // group by element so e.g. Marshmallow Basket (Sugar Rush) sits with the Fire pets.
  roster = body.pets
    .map((p, i) => ({ p, i }))
    .sort((a, b) => ELEMENT_ORDER.indexOf(a.p.element) - ELEMENT_ORDER.indexOf(b.p.element) || a.i - b.i)
    .map(({ p }) => p);
  byId.clear();
  for (const p of roster) byId.set(p.id, p);
  return roster;
}

export const getRoster = (): PetInfo[] => roster;
export const petById = (id: string): PetInfo | undefined => byId.get(id);

export function cooldownLabel(pet: PetInfo): string {
  return pet.skill ? `CD ${pet.skill.cooldownSec}s` : 'Pasif';
}
