import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_SOURCE, OUTPUT, renderPetsJson } from '../scripts/import-pets.ts';
import { mergeExtraPets, parseBaseDamage, parseSeconds, sheetToPetsData } from '../scripts/lib/petSheet.ts';
import { readFirstSheet } from '../scripts/lib/xlsx.ts';
import { BattleSession } from '../src/engine/BattleSession.ts';
import { PET_CATALOG } from '../src/data/petCatalog.ts';
import { PETS_DATA, PET_ROSTER, buildRoster, findCatalogMismatches, getPetInfo, listPets } from '../src/data/petRepository.ts';
import type { PetDefinition } from '../src/engine/types.ts';

describe('spreadsheet parsing', () => {
  it('parses cooldown cells', () => {
    assert.equal(parseSeconds('20s', 'x'), 20);
    assert.equal(parseSeconds('4.5s', 'x'), 4.5);
    assert.equal(parseSeconds('Pasif', 'x'), null);
    assert.equal(parseSeconds('-', 'x'), null);
    assert.throws(() => parseSeconds('soon', 'row 9'), /row 9/);
  });

  it('parses every Base Damage format in the sheet', () => {
    assert.deepEqual(parseBaseDamage('30'), { raw: '30', min: 30, max: 30 });
    assert.deepEqual(parseBaseDamage('1 - 40'), { raw: '1 - 40', min: 1, max: 40 });
    assert.deepEqual(parseBaseDamage('8+'), { raw: '8+', min: 8, max: null });
    assert.deepEqual(parseBaseDamage('5 / charge'), { raw: '5 / charge', min: 5, max: 5 });
    assert.deepEqual(parseBaseDamage('Instan KO'), { raw: 'Instan KO', min: null, max: null });
  });

  it('reads the workbook sheet and finds the header row', () => {
    const sheet = readFirstSheet(readFileSync(DEFAULT_SOURCE));
    assert.equal(sheet.name, 'Database Pet Battle Final');
    assert.equal(sheet.rows[3][0], 'No');
    assert.equal(sheet.rows[3][8], 'Deskripsi Efek & Mekanik Skill'); // &amp; decoded
  });

  it('rejects a sheet without the expected columns', () => {
    assert.throws(() => sheetToPetsData({ name: 'x', rows: [['No', 'Elemen']] }, 'x.xlsx'), /Missing column "Nama Pet"/);
  });

  it('committed pets_data.json is up to date with the source spreadsheet', () => {
    assert.equal(readFileSync(OUTPUT, 'utf8'), renderPetsJson(DEFAULT_SOURCE), 'run: npm run import:pets');
  });
});

describe('pets_data.json', () => {
  it('holds the 170 spreadsheet rows plus the hand-added pets, numbered 1..172', () => {
    assert.equal(PETS_DATA.count, 172);
    assert.deepEqual(PETS_DATA.pets.map((p) => p.no), Array.from({ length: 172 }, (_, i) => i + 1));
    assert.equal(PETS_DATA.pets.filter((p) => !p.origin).length, 170);
    assert.deepEqual(
      PETS_DATA.pets.filter((p) => p.origin === 'manual').map((p) => [p.name, p.element, p.ability, p.cooldown_sec]),
      [['Pet Frog', 'Water', 'Spit Mud', 12], ['Marshmallow Basket', 'Fire', 'Sugar Rush', 60]],
    );
  });

  it('rejects hand-added pets that clash with the sheet', () => {
    const row = { no: 8, element: 'Air', name: 'New Pet', visual_description: 'x', ability: 'Y', cooldown: '5s', initial_cooldown: '2.5s', base_damage: '1', effect_description: 'z' };
    assert.throws(() => mergeExtraPets(PETS_DATA, [row], 'extra.json'), /Duplicate No 8/);
    assert.throws(() => mergeExtraPets(PETS_DATA, [{ ...row, no: 999, element: 'Wood' }], 'extra.json'), /unknown element "Wood"/);
  });

  it('has the expected element split and passive pets', () => {
    const count = (el: string) => PETS_DATA.pets.filter((p) => p.element === el).length;
    assert.deepEqual([count('Air'), count('Earth'), count('Fire'), count('Water')], [53, 50, 39, 30]);
    assert.deepEqual(
      PETS_DATA.pets.filter((p) => p.is_passive).map((p) => p.ability),
      ['Soaring', 'Windspeed', 'Gift of Growganoth', 'Exoskeleton', 'Mammoth Heart', 'Stubborn'],
    );
  });

  it('keeps visual and effect descriptions for every pet', () => {
    for (const p of PETS_DATA.pets) {
      assert.ok(p.visual_description.length > 10, p.name);
      assert.ok(p.effect_description.length > 10, p.name);
    }
  });
});

describe('catalog linking', () => {
  it('every spreadsheet row matches its engine definition', () => {
    assert.deepEqual(findCatalogMismatches(PETS_DATA.pets, PET_CATALOG), []);
    assert.equal(PET_ROSTER.length, 172);
  });

  it('detects drift between the sheet and the catalog', () => {
    const records = PETS_DATA.pets.map((p) => (p.no === 8 ? { ...p, cooldown_sec: 12 } : p));
    const catalog = PET_CATALOG.filter((p) => p.no !== 54);
    const issues = findCatalogMismatches(records, catalog);
    assert.ok(issues.some((i) => i.startsWith('#8 Mid-Pacific Owl: cooldown')));
    assert.ok(issues.some((i) => i === '#54 Puppy Leash: no catalog entry'));
    assert.throws(() => buildRoster(records, catalog), /does not match pets_data.json/);
  });

  it('detects a wrong base damage on a direct-damage skill', () => {
    const catalog: PetDefinition[] = PET_CATALOG.map((p) =>
      p.no === 3 ? { ...p, skill: { ...p.skill!, effects: [{ kind: 'damage', amount: 10, unblockable: true }] } } : p,
    );
    assert.deepEqual(findCatalogMismatches(PETS_DATA.pets, catalog), ['#3 Chick Leash: base damage is 10 in catalog, 9 in sheet']);
  });

  it('exposes merged pet info by id or name and filters', () => {
    const owl = getPetInfo('mid_pacific_owl');
    assert.equal(owl, getPetInfo('Mid-Pacific Owl'));
    assert.equal(owl.skill?.name, 'Swoop');
    assert.match(owl.visualDescription, /Burung hantu/);
    assert.equal(owl.baseDamage.min, 15);
    assert.equal(listPets({ element: 'Fire' }).length, 39);
    assert.equal(listPets({ passive: true }).length, 6);
    assert.throws(() => getPetInfo('Missingno'), /Unknown pet/);
  });

  it('roster entries plug straight into a BattleSession', () => {
    const s = new BattleSession({
      matchId: 'ROSTER',
      seed: 1,
      players: {
        p1: { userId: 'A', pets: [getPetInfo('Mid-Pacific Owl'), getPetInfo('Puppy Leash')] },
        p2: { userId: 'B', pets: [getPetInfo('Fiery Dragon Leash'), getPetInfo('Baby Turtle')] },
      },
    });
    s.start();
    assert.equal(s.getState().players.p2.pets[1].name, 'Baby Turtle');
  });
});
