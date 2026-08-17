import type { SupabaseClient } from "@supabase/supabase-js";

export const ROTATION_STEPS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATION_STEPS)[number];

// pdf.js accepts any multiple of 90 but normalises internally; we
// constrain to the four canonical values so the DB check constraint
// and the UI agree, and so a negative or wrapped value coming back
// from anywhere still lands somewhere sane.
export function normalizeRotation(value: number): Rotation {
  const wrapped = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return wrapped as Rotation;
}

export function nextRotation(current: number): Rotation {
  return normalizeRotation(current + 90);
}

export function isRotation(value: unknown): value is Rotation {
  return (
    typeof value === "number" &&
    (ROTATION_STEPS as readonly number[]).includes(value)
  );
}

export type MapRotations = Record<string, Rotation>;

export async function fetchMapRotations(
  supabase: SupabaseClient,
  storagePaths: string[],
): Promise<MapRotations> {
  const paths = storagePaths.filter(Boolean);
  if (paths.length === 0) return {};
  const { data } = await supabase
    .from("site_map_rotations")
    .select("storage_path, rotation")
    .in("storage_path", paths);

  const out: MapRotations = {};
  for (const row of (data ?? []) as {
    storage_path: string;
    rotation: number;
  }[]) {
    if (isRotation(row.rotation)) out[row.storage_path] = row.rotation;
  }
  return out;
}

export async function saveMapRotation(
  supabase: SupabaseClient,
  storagePath: string,
  rotation: number,
  email?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("site_map_rotations").upsert(
    {
      storage_path: storagePath,
      rotation: normalizeRotation(rotation),
      updated_at: new Date().toISOString(),
      updated_by_email: email ?? null,
    },
    { onConflict: "storage_path" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
