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
  photo_storage_path: string | null;
  photo_uploaded_at: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
};

export type JobPanel = {
  id: string;
  job_id: string;
  name: string;
  comm_room: string | null;
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

