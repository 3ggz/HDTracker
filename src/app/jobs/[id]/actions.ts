"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { doorContactItemForName, STANDALONE_DOOR_NAME } from "@/lib/jobs";
import { extractExciterMac } from "@/lib/mac";
import { JOB_BUCKET } from "@/lib/job-photos";
import { isAdminEmail } from "@/lib/admin";

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
  // Which floor the gear bucket belongs to. Detection can't tell, so
  // this comes from the review dialog; null keeps it in the
  // Miscellaneous section until someone places it.
  standaloneFloor?: string | null;
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
      const floor = input.standaloneFloor ?? null;
      // There's one bucket per floor now, so reuse the floor's
      // existing one. Inserting unconditionally would give a floor two
      // buckets on a second scan, and the UI keys them by floor — the
      // older bucket's gear would silently stop being rendered.
      const existingQuery = supabase
        .from("job_doors")
        .select("id")
        .eq("job_id", input.jobId)
        .eq("name", STANDALONE_DOOR_NAME);
      const { data: existing } = await (floor === null
        ? existingQuery.is("floor", null)
        : existingQuery.eq("floor", floor)
      ).maybeSingle();

      const { data: standaloneDoor, error: standaloneDoorError } = existing
        ? { data: existing, error: null }
        : await supabase
            .from("job_doors")
            .insert({
              job_id: input.jobId,
              name: STANDALONE_DOOR_NAME,
              floor,
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

// Admin-only — job deletion cascades through doors / items / photos
// / panels / site map / annotations, which is destructive enough that
// only the admin set should have the trigger. RLS on jobs is still
// permissive (per the project's "leave RLS alone for now" rule), so
// the gate is enforced here in the server action.
export async function deleteJobAction(jobId: string): Promise<DeleteResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!isAdminEmail(user?.email)) {
      return { ok: false, error: "Only admins can delete jobs." };
    }
    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", jobId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error:
          "Database didn't report an error but no rows were affected. Try signing out and back in.",
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("deleteJobAction failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected server error.",
    };
  }
}

// Re-insert a soft-deleted door item exactly as it was. Used by the
// inline 'Undo' banner that appears after the user taps Remove on
// an item row. New uuid + created_at; everything else preserved off
// the snapshot.
export type RestoreDoorItemSnapshot = {
  door_id: string;
  name: string;
  note: string | null;
  ip_address?: string | null;
  mac_address?: string | null;
  position: number;
  completed_at: string | null;
  photo_storage_path: string | null;
  photo_uploaded_at: string | null;
};

export type RestoreDoorItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

export async function restoreDoorItemAction(
  snapshot: RestoreDoorItemSnapshot,
): Promise<RestoreDoorItemResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_door_items")
    .insert({
      door_id: snapshot.door_id,
      name: snapshot.name,
      note: snapshot.note,
      ip_address: snapshot.ip_address ?? null,
      mac_address: snapshot.mac_address ?? null,
      position: snapshot.position,
      completed_at: snapshot.completed_at,
      photo_storage_path: snapshot.photo_storage_path,
      photo_uploaded_at: snapshot.photo_uploaded_at,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't restore item." };
  }
  return { ok: true, itemId: data.id };
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

  // The three follow-up inserts are independent of each other —
  // run them in parallel and surface the first failure instead of
  // silently returning ok with a partial restore.
  const followUps: PromiseLike<{ error: { message: string } | null }>[] = [];

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
      followUps.push(
        supabase.from("job_door_item_photos").insert(photoRows),
      );
    }
  }

  if (input.jobPhotos.length > 0) {
    const photoRows = input.jobPhotos.map((p) => ({
      job_id: input.jobId,
      door_id: newDoor.id,
      storage_path: p.storage_path,
      caption: p.caption,
    }));
    followUps.push(supabase.from("job_photos").insert(photoRows));
  }

  if (input.panelIds.length > 0) {
    const linkRows = input.panelIds.map((panel_id, idx) => ({
      panel_id,
      door_id: newDoor.id,
      position: idx,
    }));
    followUps.push(supabase.from("job_panel_doors").insert(linkRows));
  }

  if (followUps.length > 0) {
    const results = await Promise.all(followUps);
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      return {
        ok: false,
        error: `Door and items restored, but some photos or panel links failed: ${firstError.message}`,
      };
    }
  }

  return { ok: true, doorId: newDoor.id, itemIdMap };
}

// ---------------------------------------------------------------
// MAC scanning
//
// Techs photograph the label on a 5500 exciter rather than typing a
// twelve-character MAC on a phone in a mechanical room. Claude reads
// the label; extractExciterMac (pure, unit-tested) decides which of
// the strings on it is actually the MAC. Splitting it that way keeps
// the fiddly part — telling a MAC from the serial number printed
// beside it — in code that tests can pin down.
//
// Runs here rather than in the auto-detect Edge Function because a
// single small image comes back in a few seconds, well inside
// Vercel's function ceiling.
// ---------------------------------------------------------------

const MAC_SCAN_PROMPT = [
  "This is a photo of a label on a piece of access-control hardware.",
  "Transcribe every line of text you can read on the label, exactly as printed, one per line.",
  "Include any line beginning with MAC, S/N, or SN, and preserve the characters exactly — do not correct, reformat, or insert separators.",
  "If a character is ambiguous between 0/O or 1/I, prefer the digit: these are hex codes.",
  "Output only the transcribed lines. No commentary.",
].join(" ");

export type ScanMacResult =
  | { ok: true; mac: string; matchedPrefix: boolean }
  | { ok: false; error: string };

// Either a fresh camera capture (base64 from the client) or photos
// already on the item, which the server downloads itself.
//
// Downloading server-side matters: a browser fetch() against the
// storage bucket is cross-origin, and nothing else in the app fetches
// those URLs — every other use is an <img src>, which needs no CORS.
// Rather than depend on a CORS header nobody has verified, the server
// reads the object directly. It also keeps ~1 MB of base64 out of the
// server-action payload.
export type ScanMacInput =
  | { kind: "capture"; imageBase64: string; mediaType: string }
  | { kind: "stored"; storagePaths: string[] };

const VISION_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

async function readMacFromImage(
  apiKey: string,
  base64: string,
  mediaType: VisionMediaType,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      // Thinking is on by default and shares this budget with the
      // reply, so leave room even though the answer is a few lines.
      max_tokens: 4000,
      // Transcribing a label is short and scoped, and a tech is
      // standing there waiting — no reason to think hard.
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: MAC_SCAN_PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "Couldn't read that photo. Try another shot." };
    }
    return {
      ok: true,
      text: response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n"),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't reach the scanner.",
    };
  }
}

export async function scanMacAction(
  input: ScanMacInput,
): Promise<ScanMacResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to scan a MAC." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "MAC scanning isn't set up: ANTHROPIC_API_KEY is missing from the site's environment variables.",
    };
  }

  if (input.kind === "capture") {
    const mediaType = input.mediaType.toLowerCase();
    if (!(VISION_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      return {
        ok: false,
        error: "Take the photo again — that format can't be read.",
      };
    }
    const read = await readMacFromImage(
      apiKey,
      input.imageBase64,
      mediaType as VisionMediaType,
    );
    if (!read.ok) return read;
    const found = extractExciterMac(read.text);
    return found
      ? { ok: true, mac: found.mac, matchedPrefix: found.matchedPrefix }
      : {
          ok: false,
          error: "No MAC on that photo. Get closer to the label and try again.",
        };
  }

  // An item often carries a shot of the device AND a shot of its
  // label, in no reliable order. Try each until one yields a value
  // with the 5500's prefix; keep a prefix-less hit as a fallback so a
  // partial read still beats nothing.
  let fallback: { mac: string; matchedPrefix: boolean } | null = null;
  let lastError = "No MAC found on this item's photos.";
  for (const storagePath of input.storagePaths.slice(0, 4)) {
    const { data: blob, error } = await supabase.storage
      .from(JOB_BUCKET)
      .download(storagePath);
    if (error || !blob) {
      lastError = error?.message ?? "Couldn't load the photo.";
      continue;
    }
    const type = (blob.type || "image/jpeg").toLowerCase();
    if (!(VISION_MEDIA_TYPES as readonly string[]).includes(type)) continue;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const read = await readMacFromImage(
      apiKey,
      base64,
      type as VisionMediaType,
    );
    if (!read.ok) {
      lastError = read.error;
      continue;
    }
    const found = extractExciterMac(read.text);
    if (found?.matchedPrefix) {
      return { ok: true, mac: found.mac, matchedPrefix: true };
    }
    if (found && !fallback) fallback = found;
  }
  if (fallback) {
    return { ok: true, mac: fallback.mac, matchedPrefix: false };
  }
  return { ok: false, error: lastError };
}
