export function trimToNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseYearInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1900 || parsed > 2100) return null;
  return parsed;
}

// Pulls a leading number out of a flexible quantity_text so we can
// support "remove N of these" actions. Examples:
//   "50"            -> { number: 50, suffix: "" }
//   "50 zip ties"   -> { number: 50, suffix: " zip ties" }
//   "1 box"         -> { number: 1, suffix: " box" }
//   "Has some"      -> null
//   "Well stocked"  -> null
export function parseQuantityPrefix(
  quantityText: string,
): { number: number; suffix: string } | null {
  const trimmed = quantityText.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const number = Number.parseFloat(match[1]);
  if (!Number.isFinite(number)) return null;
  return { number, suffix: match[2] };
}

export function addToQuantity(
  quantityText: string,
  amount: number,
): { kind: "updated"; quantity_text: string } | null {
  const parsed = parseQuantityPrefix(quantityText);
  if (!parsed) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const next = parsed.number + amount;
  const formatted = Number.isInteger(next) ? String(next) : String(next);
  // If we just crossed the 1→2+ boundary, pluralize the leading unit
  // so "1 roll" + 1 reads as "2 rolls" rather than "2 roll".
  const suffix =
    parsed.number === 1 && next > 1
      ? pluralizeFirstWord(parsed.suffix)
      : parsed.suffix;
  return { kind: "updated", quantity_text: `${formatted}${suffix}` };
}

export function subtractFromQuantity(
  quantityText: string,
  amount: number,
): { kind: "updated"; quantity_text: string } | { kind: "remove-all" } | null {
  const parsed = parseQuantityPrefix(quantityText);
  if (!parsed) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const next = parsed.number - amount;
  if (next <= 0) return { kind: "remove-all" };
  const formatted = Number.isInteger(next) ? String(next) : String(next);
  // When we land on exactly 1, try to make the trailing unit singular
  // so "2 rolls of velcro" - 1 reads as "1 roll of velcro" rather than
  // the grammatically awkward "1 rolls of velcro".
  const suffix = next === 1 ? depluralizeFirstWord(parsed.suffix) : parsed.suffix;
  return { kind: "updated", quantity_text: `${formatted}${suffix}` };
}

// Common inventory plurals → singulars. Hits the irregulars (feet,
// inches) that generic -s/-es stripping would get wrong; everything
// else falls through to the rules-based path in depluralizeWord.
const PLURAL_TO_SINGULAR: Record<string, string> = {
  rolls: "roll",
  boxes: "box",
  packs: "pack",
  bags: "bag",
  spools: "spool",
  pairs: "pair",
  pieces: "piece",
  bundles: "bundle",
  feet: "foot",
  inches: "inch",
  yards: "yard",
  meters: "meter",
  containers: "container",
  cans: "can",
  bottles: "bottle",
  tubes: "tube",
  sheets: "sheet",
  panels: "panel",
  units: "unit",
};

const SINGULAR_TO_PLURAL: Record<string, string> = Object.fromEntries(
  Object.entries(PLURAL_TO_SINGULAR).map(([plural, singular]) => [
    singular,
    plural,
  ]),
);

export function pluralizeFirstWord(text: string): string {
  const match = text.match(/^(\s*)(\S+)(.*)$/);
  if (!match) return text;
  const [, leading, firstWord, rest] = match;
  return `${leading}${pluralizeWord(firstWord)}${rest}`;
}

function pluralizeWord(word: string): string {
  if (word.length === 0) return word;
  const lower = word.toLowerCase();

  const mapped = SINGULAR_TO_PLURAL[lower];
  if (mapped) return preserveCase(mapped, word);

  // "battery" -> "batteries"
  if (
    lower.endsWith("y") &&
    lower.length > 1 &&
    !"aeiou".includes(lower.charAt(lower.length - 2))
  ) {
    return appendCasePreserving(word.slice(0, -1), "ies");
  }

  // Hisses, fizzes, brushes, lunches -> add -es
  if (/(s|x|z|sh|ch)$/.test(lower)) {
    return appendCasePreserving(word, "es");
  }

  return appendCasePreserving(word, "s");
}

function appendCasePreserving(base: string, addition: string): string {
  if (base.length > 0 && base === base.toUpperCase() && base !== base.toLowerCase()) {
    return base + addition.toUpperCase();
  }
  return base + addition.toLowerCase();
}

export function depluralizeFirstWord(text: string): string {
  const match = text.match(/^(\s*)(\S+)(.*)$/);
  if (!match) return text;
  const [, leading, firstWord, rest] = match;
  return `${leading}${depluralizeWord(firstWord)}${rest}`;
}

function depluralizeWord(word: string): string {
  if (word.length === 0) return word;
  const lower = word.toLowerCase();

  const mapped = PLURAL_TO_SINGULAR[lower];
  if (mapped) return preserveCase(mapped, word);

  // "batteries" -> "battery"
  if (lower.endsWith("ies") && lower.length > 3) {
    return preserveCase(word.slice(0, -3) + "y", word);
  }

  // "boxes" -> "box" (only when the bare -es addition was a true plural,
  // i.e. preceded by s, x, z, sh, or ch). "houses" -> "house" (strip s
  // only) is handled by the generic case below.
  if (lower.endsWith("es") && lower.length > 2) {
    const tail = lower.slice(-4, -2);
    if (
      tail.endsWith("s") ||
      tail.endsWith("x") ||
      tail.endsWith("z") ||
      tail === "sh" ||
      tail === "ch"
    ) {
      return word.slice(0, -2);
    }
  }

  // Plain "-s" -> strip.
  if (lower.endsWith("s") && lower.length > 1) {
    return word.slice(0, -1);
  }

  return word;
}

function preserveCase(target: string, source: string): string {
  if (source.length > 0 && source === source.toUpperCase()) {
    return target.toUpperCase();
  }
  if (source.length > 0 && source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

export function formatGpsLocationLabel(
  latitude: number,
  longitude: number,
): string {
  return `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function isValidCoordinatePair(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export type VehicleItemDraft = {
  id?: string;
  name: string;
  quantity_text: string;
};

export function normalizeVehicleItemDrafts(
  drafts: VehicleItemDraft[],
): VehicleItemDraft[] {
  return drafts.flatMap((draft) => {
    const name = trimToNullable(draft.name);
    if (!name) return [];

    const quantityText = trimToNullable(draft.quantity_text) ?? "Has some";
    return [
      {
        ...(draft.id ? { id: draft.id } : {}),
        name,
        quantity_text: quantityText,
      },
    ];
  });
}
