// Floors are free text (migration 0018) so they can hold "3rd floor",
// "NICU", or "Mother-Baby". That means the app has to be careful about
// what counts as "no floor" and when a typed value is worth saving.

export function normalizeFloor(draft: string): string | null {
  return draft.trim() || null;
}

// A blank field means Unassigned, not "unchanged" — clearing a floor
// has to be savable, otherwise gear can be moved onto a floor but
// never off it.
export function isFloorDirty(draft: string, current: string | null): boolean {
  return normalizeFloor(draft) !== (current ?? null);
}

// Every floor a job already uses, for the pickers. Standalone buckets
// are included deliberately: a floor that so far only holds gateways
// is still a floor somebody should be able to pick again.
export function collectFloors(
  doors: readonly { floor: string | null }[],
): string[] {
  const seen = new Set<string>();
  for (const door of doors) {
    const floor = door.floor?.trim();
    if (floor) seen.add(floor);
  }
  return Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}
