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
  standaloneItems?: { type: string; count: number }[];
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

  // Create a synthetic "Standalone Equipment" door holding the
  // unlabeled gateways (and similar). Each unit becomes its own
  // checkable item so the tech can track installation individually.
  if (input.standaloneItems && input.standaloneItems.length > 0) {
    const totalUnits = input.standaloneItems.reduce(
      (acc, s) => acc + s.count,
      0,
    );
    if (totalUnits > 0) {
      const { data: standaloneDoor, error: standaloneDoorError } =
        await supabase
          .from("job_doors")
          .insert({
            job_id: input.jobId,
            name: "Standalone Equipment",
            floor: null,
            notes: null,
            position: positionStart + input.doors.length,
          })
          .select("id")
          .single();

      if (standaloneDoorError || !standaloneDoor) {
        return {
          ok: false,
          error: `Doors imported, but couldn't create Standalone Equipment door: ${standaloneDoorError?.message ?? "unknown error"}`,
        };
      }

      const itemRows: { door_id: string; name: string; position: number }[] =
        [];
      let pos = 0;
      for (const s of input.standaloneItems) {
        for (let i = 0; i < s.count; i++) {
          itemRows.push({
            door_id: standaloneDoor.id,
            name: s.type,
            position: pos++,
          });
        }
      }
      if (itemRows.length > 0) {
        const { error: standaloneItemsError } = await supabase
          .from("job_door_items")
          .insert(itemRows);
        if (standaloneItemsError) {
          return {
            ok: false,
            error: `Standalone Equipment door was created, but its items failed: ${standaloneItemsError.message}`,
          };
        }
      }
      created++;
    }
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

// Door delete as a server action. Mirrors deleteVehicleAction:
// .select("id") catches silent RLS-filtered deletes (where the
// query "succeeds" with error: null but affects zero rows).
export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteDoorAction(doorId: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_doors")
    .delete()
    .eq("id", doorId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Database didn't report an error but no rows were affected — RLS may have filtered, or the row was already gone.",
    };
  }
  return { ok: true };
}

export async function deleteDoorItemAction(
  itemId: string,
): Promise<DeleteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_door_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No rows were affected." };
  }
  return { ok: true };
}

// Re-creates a door (and its items, door-level photos, item-level
// photos, and panel links) from a snapshot captured just before
// deletion. New UUIDs are minted across the board — the originals are
// gone — but storage objects in the bucket persist through cascade
// deletes, so re-inserting rows that point at the same storage_path
// resurrects the photos intact.
export type RestoreDoorInput = {
  jobId: string;
  door: {
    name: string;
    notes: string | null;
    floor: string | null;
    position: number;
    tested_at: string | null;
  };
  items: {
    originalId: string;
    name: string;
    note: string | null;
    photo_storage_path: string | null;
    photo_uploaded_at: string | null;
    completed_at: string | null;
    position: number;
  }[];
  itemPhotos: {
    originalItemId: string;
    storage_path: string;
    caption: string | null;
    position: number;
  }[];
  jobPhotos: {
    storage_path: string;
    caption: string | null;
  }[];
  panelIds: string[];
};

export type RestoreDoorResult =
  | {
      ok: true;
      doorId: string;
      itemIdMap: Record<string, string>;
    }
  | { ok: false; error: string };

export async function restoreDoorAction(
  input: RestoreDoorInput,
): Promise<RestoreDoorResult> {
  const supabase = await createClient();

  const { data: newDoor, error: doorError } = await supabase
    .from("job_doors")
    .insert({
      job_id: input.jobId,
      name: input.door.name,
      notes: input.door.notes,
      floor: input.door.floor,
      position: input.door.position,
      tested_at: input.door.tested_at,
    })
    .select("id")
    .single();
  if (doorError || !newDoor) {
    return {
      ok: false,
      error: doorError?.message ?? "Couldn't restore the door.",
    };
  }

  const itemIdMap: Record<string, string> = {};
  if (input.items.length > 0) {
    const rows = input.items.map((it) => ({
      door_id: newDoor.id,
      name: it.name,
      note: it.note,
      photo_storage_path: it.photo_storage_path,
      photo_uploaded_at: it.photo_uploaded_at,
      completed_at: it.completed_at,
      position: it.position,
    }));
    const { data: insertedItems, error: itemsError } = await supabase
      .from("job_door_items")
      .insert(rows)
      .select("id");
    if (itemsError || !insertedItems) {
      return {
        ok: false,
        error: `Door restored, but its items failed: ${itemsError?.message ?? "unknown error"}`,
      };
    }
    insertedItems.forEach((row, idx) => {
      itemIdMap[input.items[idx].originalId] = row.id;
    });
  }

  if (input.itemPhotos.length > 0) {
    const photoRows = input.itemPhotos
      .map((p) => ({
        item_id: itemIdMap[p.originalItemId],
        storage_path: p.storage_path,
        caption: p.caption,
        position: p.position,
      }))
      .filter((r) => r.item_id);
    if (photoRows.length > 0) {
      await supabase.from("job_door_item_photos").insert(photoRows);
    }
  }

  if (input.jobPhotos.length > 0) {
    const photoRows = input.jobPhotos.map((p) => ({
      job_id: input.jobId,
      door_id: newDoor.id,
      storage_path: p.storage_path,
      caption: p.caption,
    }));
    await supabase.from("job_photos").insert(photoRows);
  }

  if (input.panelIds.length > 0) {
    const linkRows = input.panelIds.map((panel_id, idx) => ({
      panel_id,
      door_id: newDoor.id,
      position: idx,
    }));
    await supabase.from("job_panel_doors").insert(linkRows);
  }

  return { ok: true, doorId: newDoor.id, itemIdMap };
}
