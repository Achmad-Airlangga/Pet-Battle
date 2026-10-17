/**
 * Imports the pet database spreadsheet into src/data/pets_data.json, then
 * appends the hand-added pets from data/source/extra_pets.json.
 *
 *   npm run import:pets                    # default source in data/source/
 *   npm run import:pets -- path/to/file.xlsx
 *   npm run import:pets -- --check         # exit 1 if pets_data.json is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFirstSheet } from './lib/xlsx.ts';
import { mergeExtraPets, sheetToPetsData, type ExtraPetRow } from './lib/petSheet.ts';

export const DEFAULT_SOURCE = resolve(import.meta.dirname, '../data/source/growtopia_pet_battle_database.xlsx');
export const DEFAULT_EXTRAS = resolve(import.meta.dirname, '../data/source/extra_pets.json');
export const OUTPUT = resolve(import.meta.dirname, '../src/data/pets_data.json');

export function renderPetsJson(sourcePath: string, extrasPath: string | null = DEFAULT_EXTRAS): string {
  let data = sheetToPetsData(readFirstSheet(readFileSync(sourcePath)), basename(sourcePath));
  if (extrasPath) {
    const extras = JSON.parse(readFileSync(extrasPath, 'utf8')) as { pets: ExtraPetRow[] };
    data = mergeExtraPets(data, extras.pets, basename(extrasPath));
  }
  return JSON.stringify(data, null, 2) + '\n';
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const source = resolve(args.find((a) => !a.startsWith('--')) ?? DEFAULT_SOURCE);
  const json = renderPetsJson(source);
  const count = JSON.parse(json).count;

  if (check) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {}
    if (current !== json) {
      console.error(`pets_data.json is out of date with ${basename(source)}. Run: npm run import:pets`);
      process.exit(1);
    }
    console.log(`pets_data.json is up to date (${count} pets).`);
  } else {
    writeFileSync(OUTPUT, json);
    console.log(`Wrote ${count} pets from ${basename(source)} to ${OUTPUT}`);
  }
}
