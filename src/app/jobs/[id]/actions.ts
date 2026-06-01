"use server";

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { JOB_BUCKET } from "@/lib/job-photos";
import { doorContactItemForName } from "@/lib/jobs";

const EQUIPMENT_ENUM = [
  "5500 Exciter",
  "5200 Exciter",
  "3220 Exciter",
  "4210 Antenna",
  "Strobe",
] as const;

const DetectedDoorSchema = z.object({
  name: z.string().describe("Door label as printed on the map, e.g. 'E113', 'D9', 'SX'."),
  floor: z
    .union([z.string(), z.null()])
    .describe(
      "Floor or unit label from the page this door appears on. Read it from the title block, page header, or large floor-name text on the page (e.g. '3rd floor', 'NICU', 'Mother-Baby Floor 3'). All doors on the same PDF page share this label. Null if no floor info is visible.",
    ),
  items: z
    .array(z.enum(EQUIPMENT_ENUM))
    .describe(
      "Equipment dots clustered within ~200px of this door's label. Use only the exact strings in the enum.",
    ),
  notes: z
    .union([z.string(), z.null()])
    .describe("Short note if the map shows something distinctive about this door, otherwise null."),
});

const ExtractionSchema = z.object({
  doors: z.array(DetectedDoorSchema),
});

export type DetectedDoor = z.infer<typeof DetectedDoorSchema>;

export type AutoDetectResult =
  | { ok: true; doors: DetectedDoor[] }
  | { ok: false; error: string };

const LEGEND = `
HUGS infant-protection site-map legend:
- Magenta/pink filled dot           → "5500 Exciter"  (EX-5500 LF Controller — the door's main controller; one per door)
- Green filled dot                  → "5200 Exciter"  (EX-5200 LF Exciter)
- Cyan / light blue dot             → "3220 Exciter"  (EX-3220 LF Exciter)
- Small red dot labeled "ANT"       → "4210 Antenna"
- Yellow circle with "S" inside     → "Strobe"        (Strobe-Sounder)
`.trim();

const EXTRACTION_PROMPT = `
You are analyzing a site-map PDF for a low-voltage HUGS install. Extract one door per 5500 controller. Be exhaustive and consistent.

${LEGEND}

THE PRIMARY RULE — COUNT DOORS BY 5500 DOTS:
Each magenta/pink dot (5500 Exciter) represents exactly ONE door. The total number of doors equals the total number of 5500 dots across all pages. Do not count by red-bordered labels — labels can be ambiguous; 5500 dots are not. If you see N 5500 dots on a page, you must output N doors for that page.

DEVICE-TO-DOOR ASSIGNMENT — FOLLOW THE WIRE:
Each non-5500 device (5200, 3220, 4210, Strobe) belongs to whichever 5500 it is connected to via the wire line (usually a brown/red line that visually links the dots). Use the wire connection, not Euclidean distance. If a device has no visible wire to any 5500, omit it.

DOOR NAMING — CONSOLIDATE SUB-LABELS:
A 5500 dot is usually surrounded by one or more red-bordered text labels (e.g. "E113", "D9", "E79-CG", "E79-CF", "E101-FD"). Pick the door's name like this:
1. Collect every label within ~150 px of the 5500 dot.
2. If multiple labels share a base prefix followed by a hyphen-suffix (e.g. "E79-CG" and "E79-CF", or "E101-FD" and "E101-FC"), use just the base ("E79", "E101"). These are sub-labels of the same door.
3. If only one label appears, use it as-is — including any hyphen suffix.
4. If no label is visible near a 5500, name the door "Door #N" where N is the sequential index of that 5500 on the page.
Never invent labels.

FLOOR / UNIT:
Read the floor or unit label from the page's title block or large header text (e.g. "3rd floor", "NICU", "Mother-Baby Floor 3"). Every door on the same page shares that floor.

ITEMS:
For each door, list the equipment connected via wire to its 5500. Use ONLY these exact strings — never invent or paraphrase: "5500 Exciter", "5200 Exciter", "3220 Exciter", "4210 Antenna", "Strobe". Always include "5500 Exciter" since every door has one. Other devices are included only when the wire connects them to that 5500.

DEDUPLICATION ACROSS PAGES:
If the same consolidated door name appears on multiple pages (e.g. wiring continuation), return it once with the union of its equipment and the floor of the first occurrence.

SELF-CHECK BEFORE RESPONDING:
Recount the magenta 5500 dots on each page. Confirm your output door count equals that total. If they don't match, find the missing 5500(s) and add the corresponding door(s) before responding.
`.trim();

export async function autoDetectDoorsAction(
  jobId: string,
): Promise<AutoDetectResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "Auto-detect isn't configured yet — ANTHROPIC_API_KEY is missing on the server.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, site_map_path")
    .eq("id", jobId)
    .single();
  if (jobError || !job) {
    return { ok: false, error: jobError?.message ?? "Job not found." };
  }
  if (!job.site_map_path) {
    return { ok: false, error: "Upload a site-map PDF first." };
  }

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from(JOB_BUCKET)
    .download(job.site_map_path);
  if (downloadError || !pdfBlob) {
    return {
      ok: false,
      error: downloadError?.message ?? "Couldn't download the site map.",
    };
  }

  const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer());
  const pdfBase64 = pdfBytes.toString("base64");

  // Hard wall-clock cap on the Anthropic call — beats the SDK's default
  // 10-minute timeout which would otherwise let Vercel kill the function
  // before we see a real error.
  const anthropic = new Anthropic({ timeout: 90_000 });
  const callStart = Date.now();

  try {
    const response = await anthropic.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(ExtractionSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    if (!response.parsed_output) {
      return {
        ok: false,
        error: "Model returned no structured output. Try again or import manually.",
      };
    }

    const normalized: DetectedDoor[] = response.parsed_output.doors
      .map((d) => ({
        name: d.name.trim(),
        floor: d.floor?.trim() || null,
        items: Array.from(new Set(d.items)),
        notes: d.notes?.trim() || null,
      }))
      .filter((d) => d.name.length > 0);

    console.log(`[auto-detect] success ${Date.now() - callStart}ms`);
    return { ok: true, doors: normalized };
  } catch (err) {
    console.log(
      `[auto-detect] failed ${Date.now() - callStart}ms:`,
      err instanceof Error ? err.message : err,
    );
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return {
        ok: false,
        error:
          "The Claude API call took longer than 90s. Try a smaller PDF, or upgrade Vercel to a tier with a longer function timeout.",
      };
    }
    if (err instanceof Anthropic.APIError) {
      return {
        ok: false,
        error: `Claude API error ${err.status}: ${err.message}`,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ImportDoorsInput = {
  jobId: string;
  doors: {
    name: string;
    floor: string | null;
    items: string[];
    notes: string | null;
  }[];
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

  return { ok: true, created };
}
