// Auto-detect doors from a job's uploaded site-map PDF, using Claude
// vision. Runs as a Supabase Edge Function (Deno runtime, 150s default
// timeout) so we don't hit Vercel Hobby's 10s function cap.
//
// Deployed automatically via .github/workflows/deploy-edge-functions.yml
// on every push to main that touches this file.

import Anthropic from "npm:@anthropic-ai/sdk@0.100.1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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

const LEGEND = [
  "HUGS infant-protection site-map legend:",
  "- Magenta/pink filled dot           -> '5500 Exciter'  (EX-5500 LF Controller - the door's main controller; one per door)",
  "- Green filled dot                  -> '5200 Exciter'  (EX-5200 LF Exciter)",
  "- Cyan / light blue dot             -> '3220 Exciter'  (EX-3220 LF Exciter)",
  "- Small red dot labeled 'ANT'       -> '4210 Antenna'",
  "- Yellow circle with 'S' inside     -> 'Strobe'        (Strobe-Sounder)",
].join("\n");

const EXTRACTION_PROMPT = [
  "You are analyzing a site-map PDF for a low-voltage HUGS install. Extract one door per 5500 controller. Be exhaustive and consistent.",
  "",
  LEGEND,
  "",
  "THE PRIMARY RULE - COUNT DOORS BY 5500 DOTS:",
  "Each SOLID MAGENTA/PINK filled circle (5500 Exciter) represents exactly ONE door. The total number of doors equals the total number of 5500 dots across all pages. Do not count by red-bordered labels — two labels near one dot is still one door, see DOOR NAMING below. If you see N solid magenta dots on a page, you must output N doors for that page.",
  "",
  "DO NOT CONFUSE WITH LOOKALIKES:",
  "Some maps contain BLUE CROSSHAIR CIRCLES (a blue ring with a + or crosshair inside). These are GW-3000 / GW-3100 gateways or Wi-Fi access points, NOT 5500 Exciters. The 5500 is a SOLID FILLED magenta/pink circle with no crosshair. Never count a blue crosshair as a 5500, and never create a door for one. They belong in miscNotes only if they appear in the legend with a count.",
  "",
  "DEVICE-TO-DOOR ASSIGNMENT - FOLLOW THE CHAIN:",
  "Each door is a CHAIN of dots connected by a red (sometimes brown) wire line. The wire has a fixed install order:",
  "  5500 Exciter (magenta) [head]  -->  5200 Exciter (green) [extension, optional]  -->  3220 Exciter (cyan) OR 4210 Antenna (small red 'ANT') [terminus, optional]",
  "The Strobe (yellow 'S' circle) sits alongside the 5500 at the head of the chain — it does not chain further, it's just paired to the 5500.",
  "Procedure to assign devices to doors:",
  "1. Locate every solid magenta 5500 dot. Each one is the head of one door's chain.",
  "2. From each 5500, follow the red wire line outward. EVERY colored dot the wire touches belongs to THAT 5500's door, in chain order.",
  "3. Include the nearest Strobe (yellow S) within ~100 px of the 5500 even if no visible wire — strobes pair to the 5500 by convention.",
  "4. Stop following the chain at a 3220 or 4210 — those are terminators.",
  "5. Two different doors are NEVER connected by a wire. If you think one wire connects two magenta 5500 dots, you've misread the image — re-examine that area before continuing.",
  "Do NOT assign devices by Euclidean distance — follow the actual wire connection. A green 5200 dot that is close to a 5500 but wired to a different 5500 belongs to the wired one, not the closer one.",
  "",
  "DOOR NAMING - ONE 5500 = ONE DOOR, NO MATTER HOW MANY LABELS:",
  "A 5500 dot is often surrounded by MORE THAN ONE red-bordered text label. THIS IS NORMAL — many physical doors are chained off one controller and they share the 5500. Examples seen in the wild:",
  "  - 'E7' and 'E8' both sitting next to the same magenta dot (paired elevators chained on one controller) → ONE door named 'E7+E8'",
  "  - 'E79-CG' and 'E79-CF' near the same dot (hyphenated sub-labels) → ONE door named 'E79'",
  "  - 'D11' and 'D12' adjacent and sharing a dot → ONE door named 'D11+D12'",
  "  - 'E101-FD' alone near a dot → ONE door named 'E101-FD'",
  "Naming rules, applied in order:",
  "1. Find every red-bordered label within ~200 px of the 5500 dot AND visibly connected to it by the wire line (or sharing the wire cluster).",
  "2. If those labels share a hyphenated base prefix (e.g. 'E79-CG', 'E79-CF'), collapse to the base: 'E79'.",
  "3. If those labels are distinct codes (e.g. 'E7' and 'E8'), join them with '+' in numerical order: 'E7+E8'. NEVER output them as separate doors — they share the 5500.",
  "4. If only one label, use it as-is.",
  "5. If no label visible, name 'Door #N' where N is the page-local index of the 5500.",
  "Never invent labels. Never split one 5500 into multiple doors just because multiple labels exist.",
  "",
  "FLOOR / UNIT:",
  "Read the floor or unit label from the page's title block or large header text (e.g. '3rd floor', 'NICU', 'Mother-Baby Floor 3'). Every door on the same page shares that floor.",
  "",
  "ITEMS:",
  "For each door, list the equipment connected via wire to its 5500. Use ONLY these exact strings - never invent or paraphrase: '5500 Exciter', '5200 Exciter', '3220 Exciter', '4210 Antenna', 'Strobe'. Always include '5500 Exciter' since every door has one.",
  "",
  "OTHER DEVICES (NOT TRACKED PER-DOOR):",
  "The HUGS SYMBOLS legend usually lists devices we do NOT track per door — GW-3000 Gateways, GW-3100 Gateways, Wi-Fi Access Points (Existing or Planned), Card Readers, Keypads, HUGS Tag Charging Stations, RJ-45 Jumper Cables, etc. For every legend row whose device type is NOT in our 5-item tracked list AND whose count is > 0, append one concise string to the top-level 'miscNotes' array describing it. Format like '8 GW-3100 Gateways', '1 Wi-Fi Access Point (Existing)', '4 Card Readers', '2 HUGS Tag Charging Stations'. Skip RJ-45 Jumper Cables (those are wiring, not devices). Do NOT add these to any door's items list - they belong only in miscNotes.",
  "",
  "HUGS SYMBOLS LEGEND - GROUND TRUTH COUNTS PER PAGE:",
  "Each page usually has a 'HUGS SYMBOLS' legend box (often in the top-right corner of the page, on a Securitas Healthcare title block) that lists each device type with its exact count for that page. Example numbers you may see: '14' next to EX-5500 LF Controller, '9' next to EX-5200 LF Exciter, '17' next to EX-3220 LF Exciter, '8' next to ANT-4210 LF Antenna, '14' next to Strobe-Sounder. These per-device counts are GROUND TRUTH for the page. Read them carefully before finalizing your output. The legend may also list devices we do not track ('RJ-45 Jumper Cable', 'Card Reader', 'Keypad', 'HUGS Tag Charging Station') - ignore those.",
  "",
  "DEDUPLICATION ACROSS PAGES:",
  "If the same consolidated door name appears on multiple pages (wiring continuation), return it once with the union of its equipment and the floor of the first occurrence.",
  "",
  "MANDATORY VERIFICATION — fill in pageVerification[] HONESTLY:",
  "Your response includes a 'pageVerification' array with one entry per PDF page. For each page you MUST:",
  "1. Read the HUGS SYMBOLS legend box on that page and copy each device-type count into 'legend' verbatim. If a device type is not in the legend, use 0.",
  "2. Independently count the dots you actually see on the map for that page (5500, 5200, 3220, 4210, Strobe) and write those into 'detected'.",
  "3. The host will diff 'legend' against 'detected' and flag mismatches to the user. Do NOT make detected match legend by guessing — only by actually finding the dots. If you can't find them, leave detected at the true count and the user will be alerted.",
  "4. The number of doors you return per page MUST equal that page's 'detected.ex5500' (one door per 5500).",
  "5. Before finalizing, if 'detected' is less than 'legend' for any device on any page, RE-SCAN the page (look near walls, in corners, behind text labels, in dense clusters) and find the missing dots if possible. Only then submit.",
  "",
  "DENSE CLUSTERS WARNING:",
  "On busy maps the 5500/5200/3220/Strobe dots can sit on top of each other or just a few pixels apart. Treat any pixel cluster with mixed colors as multiple dots, not one. Zoom in mentally and count each colored mark separately.",
].join("\n");

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
    miscNotes: {
      type: "array",
      items: { type: "string" },
    },
    pageVerification: {
      type: "array",
      description:
        "One entry per page in the PDF, in order. For each page, fill in BOTH the legend counts you read from the HUGS SYMBOLS box on that page AND the counts you actually found by examining the map. These must be filled in honestly — the host will compare them and flag mismatches.",
      items: {
        type: "object",
        properties: {
          pageNumber: { type: "integer" },
          legend: {
            type: "object",
            description:
              "Counts copied verbatim from the HUGS SYMBOLS legend box on this page. If a device type is absent from the legend, use 0.",
            properties: {
              ex5500: { type: "integer" },
              ex5200: { type: "integer" },
              ex3220: { type: "integer" },
              ant4210: { type: "integer" },
              strobe: { type: "integer" },
            },
            required: ["ex5500", "ex5200", "ex3220", "ant4210", "strobe"],
            additionalProperties: false,
          },
          detected: {
            type: "object",
            description:
              "Counts you actually found by examining dots on this page. Must equal the sum across doors you returned for this page.",
            properties: {
              ex5500: { type: "integer" },
              ex5200: { type: "integer" },
              ex3220: { type: "integer" },
              ant4210: { type: "integer" },
              strobe: { type: "integer" },
            },
            required: ["ex5500", "ex5200", "ex3220", "ant4210", "strobe"],
            additionalProperties: false,
          },
        },
        required: ["pageNumber", "legend", "detected"],
        additionalProperties: false,
      },
    },
  },
  required: ["doors", "miscNotes", "pageVerification"],
  additionalProperties: false,
} as const;

type DetectedDoor = {
  name: string;
  floor: string | null;
  items: string[];
  notes: string | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

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
          "Auto-detect isn't configured yet - set the ANTHROPIC_API_KEY secret on this function.",
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
    const pdfBase64 = bytesToBase64(pdfBytes);

    const anthropic = new Anthropic({
      apiKey: anthropicKey,
      timeout: 130_000,
    });

    const callStart = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
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
    console.log("[auto-detect] " + (Date.now() - callStart) + "ms");

    const textBlock = response.content.find(
      (b: { type: string }) => b.type === "text",
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) {
      return json({ ok: false, error: "Model returned no text output." });
    }

    let parsed: {
      doors?: unknown[];
      miscNotes?: unknown[];
      pageVerification?: unknown[];
    };
    try {
      parsed = JSON.parse(textBlock.text) as {
        doors?: unknown[];
        miscNotes?: unknown[];
        pageVerification?: unknown[];
      };
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

    const miscNotes: string[] = (parsed.miscNotes ?? [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);

    // Diff each page's legend vs detected counts. Surface mismatches to
    // the user so they know which device the model under-counted on.
    type PageVer = {
      pageNumber: number;
      legend: Record<string, number>;
      detected: Record<string, number>;
    };
    const pageVerification = (parsed.pageVerification ?? []) as PageVer[];
    const DEVICE_LABELS: Record<string, string> = {
      ex5500: "5500 Exciter",
      ex5200: "5200 Exciter",
      ex3220: "3220 Exciter",
      ant4210: "4210 Antenna",
      strobe: "Strobe",
    };
    const warnings: string[] = [];
    for (const pv of pageVerification) {
      for (const key of Object.keys(DEVICE_LABELS)) {
        const want = pv?.legend?.[key] ?? 0;
        const got = pv?.detected?.[key] ?? 0;
        if (want !== got) {
          const dir = got < want ? "missed" : "over-counted";
          warnings.push(
            `Page ${pv.pageNumber}: legend says ${want} × ${DEVICE_LABELS[key]}, detected ${got} (${dir} ${Math.abs(want - got)}).`,
          );
        }
      }
    }
    console.log(
      "[auto-detect] pageVerification:",
      JSON.stringify(pageVerification),
    );
    if (warnings.length > 0) {
      console.log("[auto-detect] warnings:", warnings.join(" | "));
    }

    return json({ ok: true, doors: normalized, miscNotes, warnings });
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
