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
  return { kind: "updated", quantity_text: `${formatted}${parsed.suffix}` };
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
