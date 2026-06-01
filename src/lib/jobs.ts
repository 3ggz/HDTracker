export type Job = {
  id: string;
  name: string;
  number: string | null;
  address: string | null;
  notes: string | null;
  site_map_path: string | null;
  site_map_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobDoor = {
  id: string;
  job_id: string;
  name: string;
  notes: string | null;
  position: number;
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

