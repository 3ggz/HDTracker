"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DeleteVehicleResult =
  | { ok: true }
  | { ok: false; error: string };

// Server-side delete so we can:
//   1. Verify rows were actually affected via .select() — a client-side
//      delete with .eq() silently succeeds (error: null) when RLS
//      filters away the row, which previously made deletes look like
//      they worked when they hadn't.
//   2. Call revalidatePath("/") so the home page re-fetches the
//      vehicle list immediately on next navigation, no stale-cache
//      flash showing the just-deleted row.
//
// Cascade FKs on vehicle_items / vehicle_issues / vehicle_photos /
// vehicle_activity handle their own cleanup; storage objects for
// photos are intentionally orphaned (cleanup is a future sweeper).
export async function deleteVehicleAction(
  id: string,
): Promise<DeleteVehicleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };

  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't delete this vehicle — no rows were affected. The RLS policy may be blocking it, or it's already gone.",
    };
  }

  revalidatePath("/");
  revalidatePath("/quickview");
  return { ok: true };
}
