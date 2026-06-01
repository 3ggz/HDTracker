// Auto-detect doors from a job's uploaded site-map PDF, using Claude
// vision. Runs as a Supabase Edge Function (Deno runtime, 150s default
// timeout) so we don't hit Vercel Hobby's 10s function cap.
//
// Deploy from the Supabase dashboard (Edge Functions → New function),
// or via `supabase functions deploy auto-detect-doors`. Set the
// ANTHROPIC_API_KEY secret first:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The client calls it via supabase.functions.invoke('auto-detect-doors',
// { body: { jobId } }). The user's JWT is forwarded automatically, and
// we use it to scope Supabase queries to RLS (currently permissive).

import Anthropic from "npm:@anthropic-ai/sdk@^0.100.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EQUIPMENT_ENUM = [
  "5500 Exciter",
  "5200 Exciter",
  "3220 Exciter",
  "4210 Antenna",
  "Strobe",
] as const;

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

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    doors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          floor: { type: ["string", "null"] },
          items: {
            type: "array",
            items: { type: "string", enum: EQUIPMENT_ENUM },
          },
          notes: { type: ["string", "null"] },
        },
        required: ["name", "floor", "items", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: ["doors"],
  additionalProperties: false,
} as const;

type DetectedDoor = {
  name: string;
  floor: string | null;
  items: string[];
  notes: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Not signed in." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({
        ok: false,
        error: "Function is missing Supabase env vars.",
      });
    }
    if (!anthropicKey) {
      return json({
        ok: false,
        error:
          "Auto-detect isn't configured yet — set the ANTHROPIC_API_KEY secret on this function.",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ ok: false, error: "Not signed in." }, 401);

    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) return json({ ok: false, error: "Missing jobId." }, 400);

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, site_map_path")
      .eq("id", jobId)
      .single();
    if (jobError || !job) {
      return json({
        ok: false,
        error: jobError?.message ?? "Job not found.",
      });
    }
    if (!job.site_map_path) {
      return json({ ok: false, error: "Upload a site-map PDF first." });
    }

    const { data: pdfBlob, error: dlError } = await supabase.storage
      .from("job-files")
      .download(job.site_map_path);
    if (dlError || !pdfBlob) {
      return json({
        ok: false,
        error: dlError?.message ?? "Couldn't download the site map.",
      });
    }

    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    const pdfBase64 = encodeBase64(pdfBytes);

    const anthropic = new Anthropic({
      apiKey: anthropicKey,
      timeout: 130_000,
    });

    const callStart = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
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
    console.log(`[auto-detect] ${Date.now() - callStart}ms`);

    const textBlock = response.content.find(
      (b: { type: string }) => b.type === "text",
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) {
      return json({ ok: false, error: "Model returned no text output." });
    }

    let parsed: { doors?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text) as { doors?: unknown[] };
    } catch {
      return json({
        ok: false,
        error: "Model returned malformed JSON. Try again or import manually.",
      });
    }

    const normalized: DetectedDoor[] = (parsed.doors ?? [])
      .map((raw) => {
        const d = raw as Partial<DetectedDoor>;
        return {
          name: String(d.name ?? "").trim(),
          floor:
            typeof d.floor === "string" && d.floor.trim()
              ? d.floor.trim()
              : null,
          items: Array.from(
            new Set(
              (Array.isArray(d.items) ? d.items : []).filter(
                (x): x is string =>
                  typeof x === "string" &&
                  (EQUIPMENT_ENUM as readonly string[]).includes(x),
              ),
            ),
          ),
          notes:
            typeof d.notes === "string" && d.notes.trim()
              ? d.notes.trim()
              : null,
        };
      })
      .filter((d) => d.name.length > 0);

    return json({ ok: true, doors: normalized });
  } catch (err) {
    console.error("[auto-detect] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message });
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
