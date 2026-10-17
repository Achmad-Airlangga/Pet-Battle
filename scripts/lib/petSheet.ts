/** Converts the "Database Pet Battle" sheet into the pets_data.json structure. */
import { ELEMENTS, type Element } from '../../src/engine/elements.ts';
import { petIdFromName } from '../../src/data/ids.ts';
import type { BaseDamage, PetRecord, PetsDataFile } from '../../src/data/petRecord.ts';
import type { Sheet } from './xlsx.ts';

const COLUMNS = {
  no: 'No',
  element: 'Elemen',
  name: 'Nama Pet',
  visual: 'Deskripsi Bentuk Visual',
  ability: 'Nama Skill / Ability',
  cooldown: 'Cooldown (s)',
  initialCooldown: 'Cooldown Awal (s)',
  baseDamage: 'Base Damage',
  effect: 'Deskripsi Efek & Mekanik Skill',
} as const;

type ColumnKey = keyof typeof COLUMNS;

const NUM = String.raw`\d+(?:\.\d+)?`;

/** "20s" -> 20, "4.5s" -> 4.5, "Pasif" / "-" -> null. */
export function parseSeconds(raw: string, where: string): number | null {
  const s = raw.trim();
  if (s === '' || s === '-' || /^pasif$/i.test(s)) return null;
  const m = s.match(new RegExp(`^(${NUM})\\s*s?$`, 'i'));
  if (!m) throw new Error(`${where}: cannot parse seconds from "${raw}"`);
  return Number(m[1]);
}

export function parseBaseDamage(raw: string): BaseDamage {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp(`^(${NUM})\\s*-\\s*(${NUM})$`)))) return { raw: s, min: Number(m[1]), max: Number(m[2]) };
  if ((m = s.match(new RegExp(`^(${NUM})\\s*\\+$`)))) return { raw: s, min: Number(m[1]), max: null };
  if ((m = s.match(new RegExp(`^(${NUM})(?:\\s*/.*)?$`)))) return { raw: s, min: Number(m[1]), max: Number(m[1]) };
  return { raw: s, min: null, max: null };
}

export function sheetToPetsData(sheet: Sheet, sourceName: string): PetsDataFile {
  const headerRowIndex = sheet.rows.findIndex((row) => row?.[0]?.trim() === COLUMNS.no);
  if (headerRowIndex < 0) throw new Error(`Header row ("${COLUMNS.no}" in column A) not found`);
  const header = sheet.rows[headerRowIndex].map((h) => h?.trim());
  const col = {} as Record<ColumnKey, number>;
  for (const [key, title] of Object.entries(COLUMNS) as [ColumnKey, string][]) {
    const index = header.indexOf(title);
    if (index < 0) throw new Error(`Missing column "${title}"`);
    col[key] = index;
  }

  const pets: PetRecord[] = [];
  for (let r = headerRowIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => !c?.trim())) continue;
    const cell = (key: ColumnKey) => (row[col[key]] ?? '').trim();
    const where = `row ${r + 1}`;

    const no = Number(cell('no'));
    if (!Number.isInteger(no) || no <= 0) throw new Error(`${where}: invalid No "${cell('no')}"`);
    const element = cell('element') as Element;
    if (!ELEMENTS.includes(element)) throw new Error(`${where}: unknown element "${element}"`);
    const name = cell('name');
    if (!name) throw new Error(`${where}: empty pet name`);

    const cooldown = parseSeconds(cell('cooldown'), `${where} cooldown`);
    const initial = parseSeconds(cell('initialCooldown'), `${where} initial cooldown`);
    if ((cooldown === null) !== (initial === null)) throw new Error(`${where}: cooldown and initial cooldown disagree on passive`);

    pets.push({
      no,
      id: petIdFromName(name),
      element,
      name,
      visual_description: cell('visual'),
      ability: cell('ability'),
      is_passive: cooldown === null,
      cooldown_sec: cooldown,
      initial_cooldown_sec: initial,
      base_damage: parseBaseDamage(cell('baseDamage')),
      effect_description: cell('effect'),
    });
  }

  assertUnique(pets);
  return { source: sourceName, sheet: sheet.name, count: pets.length, pets };
}

function assertUnique(pets: PetRecord[]): void {
  const dup = (key: 'no' | 'id') => pets.find((p, i) => pets.findIndex((q) => q[key] === p[key]) !== i);
  const dupNo = dup('no');
  if (dupNo) throw new Error(`Duplicate No ${dupNo.no}`);
  const dupId = dup('id');
  if (dupId) throw new Error(`Duplicate pet id ${dupId.id} (${dupId.name})`);
}

/** One entry of data/source/extra_pets.json: the sheet's columns, written by hand. */
export interface ExtraPetRow {
  no: number;
  element: string;
  name: string;
  visual_description: string;
  ability: string;
  cooldown: string;
  initial_cooldown: string;
  base_damage: string;
  effect_description: string;
  note?: string;
}

/** Appends hand-added pets, parsed and validated exactly like spreadsheet rows. */
export function mergeExtraPets(data: PetsDataFile, extras: ExtraPetRow[], sourceName: string): PetsDataFile {
  const added = extras.map((row): PetRecord => {
    const where = `${sourceName} #${row.no}`;
    if (!Number.isInteger(row.no) || row.no <= 0) throw new Error(`${where}: invalid No`);
    if (!ELEMENTS.includes(row.element as Element)) throw new Error(`${where}: unknown element "${row.element}"`);
    if (!row.name?.trim()) throw new Error(`${where}: empty pet name`);
    const cooldown = parseSeconds(row.cooldown, `${where} cooldown`);
    const initial = parseSeconds(row.initial_cooldown, `${where} initial cooldown`);
    if ((cooldown === null) !== (initial === null)) throw new Error(`${where}: cooldown and initial cooldown disagree on passive`);
    const record: PetRecord = {
      no: row.no,
      id: petIdFromName(row.name.trim()),
      element: row.element as Element,
      name: row.name.trim(),
      visual_description: row.visual_description.trim(),
      ability: row.ability.trim(),
      is_passive: cooldown === null,
      cooldown_sec: cooldown,
      initial_cooldown_sec: initial,
      base_damage: parseBaseDamage(row.base_damage),
      effect_description: row.effect_description.trim(),
      origin: 'manual',
    };
    if (row.note) record.note = row.note.trim();
    return record;
  });
  const pets = [...data.pets, ...added];
  assertUnique(pets);
  return { ...data, extras_source: sourceName, count: pets.length, pets };
}
