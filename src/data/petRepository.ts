/**
 * Links the spreadsheet data (pets_data.json: names, visuals, descriptions,
 * cooldowns) with the engine catalog (petCatalog.ts: executable skill effects).
 * The two are cross-checked row by row; any drift throws at load time.
 */
import petsData from './pets_data.json' with { type: 'json' };
import { PET_CATALOG } from './petCatalog.ts';
import type { BaseDamage, PetRecord, PetsDataFile } from './petRecord.ts';
import type { Element } from '../engine/elements.ts';
import type { PetDefinition } from '../engine/types.ts';

/** Engine definition plus the display data from the spreadsheet. */
export interface PetInfo extends PetDefinition {
  no: number;
  visualDescription: string;
  effectDescription: string;
  baseDamage: BaseDamage;
}

export const PETS_DATA = petsData as PetsDataFile;

/** Returns every mismatch between the spreadsheet records and the engine catalog. */
export function findCatalogMismatches(records: readonly PetRecord[], catalog: readonly PetDefinition[]): string[] {
  const issues: string[] = [];
  const byNo = new Map(catalog.map((p) => [p.no, p]));
  const seen = new Set<number>();

  for (const rec of records) {
    const tag = `#${rec.no} ${rec.name}`;
    const def = byNo.get(rec.no);
    if (!def) {
      issues.push(`${tag}: no catalog entry`);
      continue;
    }
    seen.add(rec.no);
    const expect = (field: string, actual: unknown, expected: unknown) => {
      if (actual !== expected) issues.push(`${tag}: ${field} is ${JSON.stringify(actual)} in catalog, ${JSON.stringify(expected)} in sheet`);
    };
    expect('id', def.id, rec.id);
    expect('name', def.name, rec.name);
    expect('element', def.element, rec.element);
    expect('ability', def.ability, rec.ability);
    expect('passive', !def.skill, rec.is_passive);
    if (def.skill) {
      expect('cooldown', def.skill.cooldownSec, rec.cooldown_sec);
      expect('initial cooldown', def.skill.initialCooldownSec, rec.initial_cooldown_sec);
      expect('skill name', def.skill.name, rec.ability);

      // Direct-damage skills: the leading damage effect must match "Base Damage".
      const first = def.skill.effects[0];
      if (first?.kind === 'damage') {
        if (first.perCharge !== undefined) expect('damage per charge', first.perCharge, rec.base_damage.min);
        else if (typeof first.amount === 'number') expect('base damage', first.amount, rec.base_damage.min);
        else {
          expect('min damage', first.amount.min, rec.base_damage.min);
          expect('max damage', first.amount.max, rec.base_damage.max);
        }
      }
    }
  }
  for (const def of catalog) {
    if (def.no === undefined || !seen.has(def.no)) issues.push(`catalog pet ${def.name} (#${def.no}) is not in the sheet`);
  }
  return issues;
}

export function buildRoster(records: readonly PetRecord[], catalog: readonly PetDefinition[]): PetInfo[] {
  const issues = findCatalogMismatches(records, catalog);
  if (issues.length) throw new Error(`Pet catalog does not match pets_data.json:\n  ${issues.join('\n  ')}`);
  const byNo = new Map(catalog.map((p) => [p.no, p]));
  return records.map((rec) => ({
    ...byNo.get(rec.no)!,
    no: rec.no,
    visualDescription: rec.visual_description,
    effectDescription: rec.effect_description,
    baseDamage: rec.base_damage,
  }));
}

/** All pets: the 170 spreadsheet rows, then the hand-added ones. */
export const PET_ROSTER: readonly PetInfo[] = buildRoster(PETS_DATA.pets, PET_CATALOG);

const BY_KEY = new Map<string, PetInfo>();
for (const p of PET_ROSTER) {
  BY_KEY.set(p.id, p);
  BY_KEY.set(p.name.toLowerCase(), p);
}

export function getPetInfo(idOrName: string): PetInfo {
  const pet = BY_KEY.get(idOrName) ?? BY_KEY.get(idOrName.toLowerCase());
  if (!pet) throw new Error(`Unknown pet: ${idOrName}`);
  return pet;
}

export function listPets(filter: { element?: Element; passive?: boolean } = {}): PetInfo[] {
  return PET_ROSTER.filter(
    (p) => (filter.element === undefined || p.element === filter.element) && (filter.passive === undefined || !p.skill === filter.passive),
  );
}
