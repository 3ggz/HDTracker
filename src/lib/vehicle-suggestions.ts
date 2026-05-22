// Builds the suggestion lists shown as autocomplete on the vehicle
// detail screen. Item names are scoped per category (hardware vs tool)
// — a "Drill" in tools shouldn't suggest itself under hardware — but
// quantity descriptors are shared across both (a "1 roll" makes sense
// for either). The default quantity options NONE / HAS SOME / WELL
// STOCKED are always present so the simplest path is available even
// before anyone's typed a custom value.

export type VehicleItemCategory = "hardware" | "tool";

export type VehicleItemSlim = {
  category: VehicleItemCategory;
  name: string;
  quantity_text: string;
};

export type VehicleItemSuggestions = {
  hardwareNames: string[];
  toolNames: string[];
  quantities: string[];
};

export const DEFAULT_QUANTITY_OPTIONS: readonly string[] = [
  "None",
  "Low stock",
  "Has some",
  "Well stocked",
];

export function buildVehicleItemSuggestions(
  items: VehicleItemSlim[],
): VehicleItemSuggestions {
  const hardwareNames = sortedUniqNonBlank(
    items.filter((item) => item.category === "hardware").map((item) => item.name),
  );
  const toolNames = sortedUniqNonBlank(
    items.filter((item) => item.category === "tool").map((item) => item.name),
  );
  const quantities = sortedUniqNonBlank([
    ...DEFAULT_QUANTITY_OPTIONS,
    ...items.map((item) => item.quantity_text),
  ]);

  return { hardwareNames, toolNames, quantities };
}

function sortedUniqNonBlank(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}
