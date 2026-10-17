/** Stable pet id derived from its name: "Mid-Pacific Owl" -> "mid_pacific_owl". */
export const petIdFromName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
