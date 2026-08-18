export type Job = {
  id: string;
  name: string;
  number: string | null;
  address: string | null;
  notes: string | null;
  site_map_path: string | null;
  site_map_uploaded_at: string | null;
  site_map_url: string | null;
  site_map_label: string | null;
  completed_at: string | null;
  manual_workers: string[];
  share_token: string;
  created_at: string;
  updated_at: string;
};

export type JobDoor = {
  id: string;
  job_id: string;
  name: string;
  notes: string | null;
  floor: string | null;
  tested_at: string | null;
  position: number;
  template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JobDoorItem = {
  id: string;
  door_id: string;
  name: string;
  note: string | null;
  ip_address: string | null;
  mac_address: string | null;
  photo_storage_path: string | null;
  photo_uploaded_at: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
};

// Items eligible for IP + MAC address fields. 5500 exciters are the
// networked device on a HUGS door; extend this test if more device
// families grow network config later.
// Doors with this exact name aren't doors — they're the synthetic
// bucket holding standalone equipment (gateways and similar) that the
// auto-detect import can't attach to a real opening.
//
// There is one per floor, plus one with a null floor for gear nobody
// has placed yet. Reusing job_doors.floor rather than inventing a
// floor field on items means floor renames, grouping, and ordering all
// keep working untouched. Anything reading doors must therefore expect
// SEVERAL of these, not one.
export const STANDALONE_DOOR_NAME = "Standalone Equipment";

export function isStandaloneDoor(door: { name: string }): boolean {
  return door.name === STANDALONE_DOOR_NAME;
}

export function splitStandaloneDoors<T extends { name: string }>(
  doors: T[],
): { realDoors: T[]; standaloneDoors: T[] } {
  return {
    realDoors: doors.filter((d) => !isStandaloneDoor(d)),
    standaloneDoors: doors.filter(isStandaloneDoor),
  };
}

export function itemSupportsNetworkFields(name: string): boolean {
  return /5500/.test(name);
}

export type JobPanel = {
  id: string;
  job_id: string;
  name: string;
  comm_room: string | null;
  notes: string | null;
  photo_storage_path: string | null;
  photo_uploaded_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type JobPanelDoor = {
  panel_id: string;
  door_id: string;
  position: number;
  created_at: string;
};

export type JobDoorItemPhoto = {
  id: string;
  item_id: string;
  storage_path: string;
  caption: string | null;
  position: number;
  uploaded_by: string | null;
  created_at: string;
};

export type JobPanelPhoto = {
  id: string;
  panel_id: string;
  storage_path: string;
  caption: string | null;
  position: number;
  uploaded_by: string | null;
  created_at: string;
};

// Canonical install order of HUGS equipment. Any item name not in this
// list is sorted to the end, in insertion order. The comparator is
// used at display time only — the database stores `position` as a
// stable tiebreaker but the actual ordering on screen comes from here.
export const CANONICAL_ITEM_ORDER: readonly string[] = [
  "HUGS 8 board",
  "5500 Exciter",
  "5200 Exciter",
  "3220 Exciter",
  "4210 Antenna",
  "Strobe",
  "Door contact",
  "REX",
];

// Door labels starting with E are elevators (REX). Everything else
// — D, S (stairwells), SW/SX/SB/ST etc. — uses a door contact.
export function doorContactItemForName(doorName: string): "Door contact" | "REX" {
  return /^e/i.test(doorName.trim()) ? "REX" : "Door contact";
}

export function compareCanonicalItems(
  a: { name: string; position: number },
  b: { name: string; position: number },
): number {
  const ai = CANONICAL_ITEM_ORDER.indexOf(a.name);
  const bi = CANONICAL_ITEM_ORDER.indexOf(b.name);
  // Both known → canonical order.
  if (ai !== -1 && bi !== -1) return ai - bi;
  // Known beats unknown.
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  // Two unknowns → fall back to position (insertion order).
  return a.position - b.position;
}

// Natural sort that handles "D1 < D9 < D10 < D15" and "E101 < E113".
// Splits each name into [non-digits, digits, non-digits, ...] and
// compares chunks pairwise. Non-numeric chunks compared case-insensitively;
// numeric chunks compared as numbers.
export function compareDoorNames(a: string, b: string): number {
  const ax = a.match(/(\d+|\D+)/g) ?? [];
  const bx = b.match(/(\d+|\D+)/g) ?? [];
  const len = Math.min(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const ap = ax[i];
    const bp = bx[i];
    const aIsNum = /^\d+$/.test(ap);
    const bIsNum = /^\d+$/.test(bp);
    if (aIsNum && bIsNum) {
      const diff = parseInt(ap, 10) - parseInt(bp, 10);
      if (diff !== 0) return diff;
    } else {
      const diff = ap.localeCompare(bp, undefined, { sensitivity: "base" });
      if (diff !== 0) return diff;
    }
  }
  return ax.length - bx.length;
}


export type NetworkRow = {
  id: string;
  label: string;
  item: string;
  ip: string | null;
  mac: string | null;
  floor: string | null;
  isStandalone: boolean;
};

// The IP / MAC list behind every export: copy-to-clipboard, the
// in-editor print sheet, and the standalone /netlist page. Standalone
// gear sorts AFTER every real door rather than by name — gateways
// landing between D1 and Ramp Door reads like the doors themselves are
// out of order, and a network admin scanning the sheet expects the
// openings first and the shared gear at the bottom.
export function buildNetworkRows(
  doors: { id: string; name: string | null; floor?: string | null }[],
  items: JobDoorItem[],
): NetworkRow[] {
  const doorById = new Map(doors.map((d) => [d.id, d]));
  return items
    .filter((it) => it.ip_address || it.mac_address)
    .map((it) => {
      const door = doorById.get(it.door_id);
      const name = door?.name?.trim();
      // Standalone gear has no meaningful door — its identity is the
      // unit itself: the per-unit label from the note column, falling
      // back to the device name.
      const isStandalone = name === STANDALONE_DOOR_NAME;
      return {
        id: it.id,
        label: isStandalone
          ? it.note?.trim()
            ? `${it.name} — ${it.note.trim()}`
            : it.name
          : name || "Unnamed door",
        item: it.name,
        ip: it.ip_address,
        mac: it.mac_address,
        // Standalone buckets are per-floor now, so their gear keeps
        // the bucket's floor — floorless buckets yield null and land
        // in the trailing Standalone group.
        floor: door?.floor ?? null,
        isStandalone,
      };
    })
    .sort((a, b) => {
      if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;
      return compareDoorNames(a.label, b.label);
    });
}

// The Device column earns its place only when a real door hosts more
// than one networked item. Standalone gear never counts: its label
// already carries the device name, so several identically-named
// gateways were pulling in a column that then repeated that name.
export function shouldShowDeviceColumn(rows: NetworkRow[]): boolean {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.isStandalone) continue;
    counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
  }
  return Array.from(counts.values()).some((n) => n > 1);
}

// Floor bucketing for the IP/MAC exports — every surface groups
// through here so the sections match everywhere. Named floors sort
// naturally (2 before 10), the null-floor bucket lands second-to-
// last as "Unassigned", and floorless standalone gear closes the
// list under "Standalone" (standalone buckets that DO carry a floor
// group under that floor, after the floor's real doors). Rows inside
// each bucket keep natural door ordering.
export const UNASSIGNED_FLOOR_LABEL = "Unassigned";
export const STANDALONE_GROUP_LABEL = "Standalone";

export type NetworkFloorGroup = { label: string; rows: NetworkRow[] };

export function groupNetworkRowsByFloor(
  rows: NetworkRow[],
): NetworkFloorGroup[] {
  const buckets = new Map<string, NetworkRow[]>();
  for (const r of rows) {
    const floor = r.floor?.trim();
    const label = floor
      ? floor
      : r.isStandalone
        ? STANDALONE_GROUP_LABEL
        : UNASSIGNED_FLOOR_LABEL;
    const list = buckets.get(label) ?? [];
    list.push(r);
    buckets.set(label, list);
  }
  const rank = (label: string) =>
    label === STANDALONE_GROUP_LABEL
      ? 2
      : label === UNASSIGNED_FLOOR_LABEL
        ? 1
        : 0;
  const entries = Array.from(buckets.entries()).sort((a, b) => {
    const diff = rank(a[0]) - rank(b[0]);
    if (diff !== 0) return diff;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
  for (const [, list] of entries) {
    list.sort((a, b) => {
      // Shared gear reads best after the floor's openings.
      if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;
      return compareDoorNames(a.label, b.label);
    });
  }
  return entries.map(([label, list]) => ({ label, rows: list }));
}

// Group headers only earn their place when floors are actually in
// use — a flat unassigned-only list stays flat.
export function shouldShowFloorGroups(groups: NetworkFloorGroup[]): boolean {
  return (
    groups.length > 1 ||
    (groups.length === 1 && groups[0].label !== UNASSIGNED_FLOOR_LABEL)
  );
}
