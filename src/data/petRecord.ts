import type { Element } from '../engine/elements.ts';

/** "Base Damage" column, kept raw plus parsed bounds ("1 - 40", "8+", "5 / charge", "Instan KO"). */
export interface BaseDamage {
  raw: string;
  /** null when not numeric (e.g. "Instan KO"). */
  min: number | null;
  /** null when open-ended ("8+") or not numeric. */
  max: number | null;
}

/** One row of growtopia_pet_battle_database.xlsx, as stored in pets_data.json. */
export interface PetRecord {
  no: number;
  id: string;
  element: Element;
  name: string;
  visual_description: string;
  ability: string;
  is_passive: boolean;
  /** null for passive abilities ("Pasif"). */
  cooldown_sec: number | null;
  /** "Cooldown Awal"; null for passive abilities ("-"). */
  initial_cooldown_sec: number | null;
  base_damage: BaseDamage;
  effect_description: string;
  /** Set for pets added by hand (data/source/extra_pets.json) rather than the spreadsheet. */
  origin?: 'manual';
  /** Source notes, e.g. which values were assumed. */
  note?: string;
}

export interface PetsDataFile {
  source: string;
  sheet: string;
  /** Hand-maintained supplement merged after the sheet rows. */
  extras_source?: string;
  count: number;
  pets: PetRecord[];
}
