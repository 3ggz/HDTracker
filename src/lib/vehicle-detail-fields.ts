export function trimToNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
