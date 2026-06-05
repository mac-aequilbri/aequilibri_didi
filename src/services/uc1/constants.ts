// Choice tables ported from uc1_roofing/models.py.

export const PITCH_FACTORS: Record<string, number> = {
  flat: 1.0,
  low: 1.015,
  standard: 1.082,
  steep: 1.221,
  very_steep: 1.414,
};

export const PITCH_CHOICES: [string, string][] = [
  ["flat", "Flat 0°"],
  ["low", "Low 10°"],
  ["standard", "Standard 22°"],
  ["steep", "Steep 35°"],
  ["very_steep", "Very Steep 45°"],
];

export const QUOTE_STATUS: [string, string][] = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
];

export const MATERIAL_CHOICES: [string, string][] = [
  ["colorbond", "Colorbond Steel"],
  ["terracotta", "Terracotta Tiles"],
  ["concrete", "Concrete Tiles"],
  ["zincalume", "Zincalume"],
  ["slate", "Natural Slate"],
  ["asphalt", "Asphalt Shingles"],
];

const MATERIAL_MAP = new Map(MATERIAL_CHOICES);

/** Human label for a material key (mirrors Django get_material_display). */
export function materialDisplay(key: string): string {
  return MATERIAL_MAP.get(key) ?? key;
}
