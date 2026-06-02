"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { doorContactItemForName } from "@/lib/jobs";

// Auto-detect itself runs as a Supabase Edge Function (Deno, 150s
// timeout) at supabase/functions/auto-detect-doors. We can't run it
// on Vercel because Hobby caps server functions at 10s. The shape
// returned by the Edge Function matches DetectedDoor below.

export type DetectedDoor = {
  name: string;
  floor: string | null;
  items: string[];
  notes: string | null;
};

export type ImportDoorsInput = {
  jobId: string;
  doors: {
    name: string;
    floor: string | null;
    items: string[];
    notes: string | null;
  }[];
  miscNotes?: string[];
};

export type ImportDoorsResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

export async function importDetectedDoorsAction(
  input: ImportDoorsInput,
): Promise<ImportDoorsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { count: existingCount } = await supabase
    .from("job_doors")
    .select("id", { count: "exact", head: true })
    .eq("job_id", input.jobId);

  const positionStart = existingCount ?? 0;
  let created = 0;

  for (let i = 0; i < input.doors.length; i++) {
    const d = input.doors[i];
    const { data: door, error: doorError } = await supabase
      .from("job_doors")
      .insert({
        job_id: input.jobId,
        name: d.name,
        floor: d.floor,
        notes: d.notes,
        position: positionStart + i,
      })
      .select("id")
      .single();

    if (doorError || !door) {
      return {
        ok: false,
        error: `Couldn't create door "${d.name}": ${doorError?.message ?? "unknown error"}`,
      };
    }

    const withBoard = d.items.includes("5500 Exciter")
      ? [...d.items, "HUGS 8 board"]
      : d.items;
    const itemNames = [...withBoard, doorContactItemForName(d.name)];

    if (itemNames.length > 0) {
      const itemRows = itemNames.map((name, idx) => ({
        door_id: door.id,
        name,
        position: idx,
      }));
      const { error: itemsError } = await supabase
        .from("job_door_items")
        .insert(itemRows);
      if (itemsError) {
        return {
          ok: false,
          error: `Door "${d.name}" was created, but its items failed: ${itemsError.message}`,
        };
      }
    }
    created++;
  }

  // Append misc-notes (non-tracked devices from the legend) to the job's
  // notes field so the tech has a record of what else is on the map.
  if (input.miscNotes && input.miscNotes.length > 0) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("notes")
      .eq("id", input.jobId)
      .single();
    const prior = (jobRow?.notes ?? "").trim();
    const block =
      "Other devices on site map (from auto-detect):\n" +
      input.miscNotes.map((n) => "- " + n).join("\n");
    const nextNotes = prior ? prior + "\n\n" + block : block;
    await supabase
      .from("jobs")
      .update({ notes: nextNotes })
      .eq("id", input.jobId);
  }

  return { ok: true, created };
}
