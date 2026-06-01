"use server";

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { JOB_BUCKET } from "@/lib/job-photos";

const EQUIPMENT_ENUM = [
  "5500 Exciter",
  "5200 Exciter",
  "3220 Exciter",
  "4210 Antenna",
  "Strobe",
] as const;

const DetectedDoorSchema = z.object({
  name: z.string().describe("Door label as printed on the map, e.g. 'E113', 'D9', 'SX'."),
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
Site map equipment legend (HUGS infant protection system):
- Magenta/pink filled dot           → "5500 Exciter"  (EX-5500 LF Controller, PoE + 24 VDC)
- Green filled dot                  → "5200 Exciter"  (EX-5200 LF Exciter, PoE)
- Cyan / light blue dot             → "3220 Exciter"  (EX-3220 LF Exciter, PoE)
- Small red dot labeled "ANT"       → "4210 Antenna"  (ANT-4210 LF Antenna)
- Yellow circle with "S" inside     → "Strobe"        (Strobe-Sounder, 24 VDC)

Doors are red-bordered boxes labeled with codes like "E113", "D9", "D15", "E101", "SX", "SW".
A door's equipment is the cluster of dots within roughly 200 pixels of the door label.
Ignore the legend block, the title block, and any equipment dots not adjacent to a labeled door.
The HUGS 8 board has no map marker — it is standard kit per door and is added at import time, not by you.
`.trim();

const EXTRACTION_PROMPT = `
You are analyzing a site-map PDF for a low-voltage installation tech. Extract every labeled door on the map along with the equipment dots clustered near it.

${LEGEND}

For each door you can identify, output its label, the list of equipment from the legend within ~200px of the label, and an optional one-line note. Use ONLY the exact equipment strings from the enum; do not invent items. Be conservative — if you are not confident a dot belongs to a particular door, omit it. If the same door label appears on multiple pages, return it once with the union of its equipment.
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

  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
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
        items: Array.from(new Set(d.items)),
        notes: d.notes?.trim() || null,
      }))
      .filter((d) => d.name.length > 0);

    return { ok: true, doors: normalized };
  } catch (err) {
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
    items: string[];
    notes: string | null;
    includeHugsBoard: boolean;
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

    const itemNames = d.includeHugsBoard
      ? [...d.items, "HUGS 8 board"]
      : d.items;

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
