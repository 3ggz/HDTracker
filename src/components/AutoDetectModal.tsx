"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  importDetectedDoorsAction,
  type DetectedDoor,
} from "@/app/jobs/[id]/actions";

type Row = DetectedDoor & {
  include: boolean;
};

export function AutoDetectModal({
  jobId,
  storagePath,
  open,
  onClose,
  onImported,
}: {
  jobId: string;
  // Which PDF to detect from — the selected site map (primary or an extra).
  // Omitted/null falls back to the job's primary on the server.
  storagePath?: string | null;
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "detecting" | "review" | "importing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [miscNotes, setMiscNotes] = useState<string[]>([]);
  const [standaloneItems, setStandaloneItems] = useState<
    { type: string; count: number }[]
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (open && phase === "idle") void runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runDetection() {
    setPhase("detecting");
    setError(null);

    const supabase = createClient();
    // Client-side cap — Edge Functions are bounded at 150s, this gives
    // a little headroom and prevents a forever-spinner if the function
    // never returns.
    const timeout = new Promise<{ data: null; error: { message: string } }>(
      (resolve) =>
        setTimeout(
          () =>
            resolve({
              data: null,
              error: {
                message:
                  "Took longer than 150s — the function probably timed out. Try a smaller PDF.",
              },
            }),
          150_000,
        ),
    );
    const { data, error: invokeError } = (await Promise.race([
      supabase.functions.invoke("auto-detect-doors", {
        body: { jobId, storagePath },
      }),
      timeout,
    ])) as {
      data:
        | {
            ok: true;
            doors: DetectedDoor[];
            miscNotes?: string[];
            standaloneItems?: { type: string; count: number }[];
            warnings?: string[];
          }
        | { ok: false; error: string }
        | null;
      error: { message: string } | null;
    };

    if (invokeError) {
      setError(
        `Couldn't reach the auto-detect function: ${invokeError.message}. Make sure the 'auto-detect-doors' Edge Function is deployed in Supabase.`,
      );
      setPhase("idle");
      return;
    }
    if (!data) {
      setError("Auto-detect returned no data.");
      setPhase("idle");
      return;
    }
    if (!data.ok) {
      setError(data.error);
      setPhase("idle");
      return;
    }
    setRows(
      data.doors.map((d) => ({
        ...d,
        include: true,
      })),
    );
    setMiscNotes(data.miscNotes ?? []);
    setStandaloneItems(data.standaloneItems ?? []);
    setWarnings(data.warnings ?? []);
    setPhase("review");
  }

  async function runImport() {
    const selected = rows.filter((r) => r.include);
    if (selected.length === 0) {
      setError("Tick at least one door to import.");
      return;
    }
    setPhase("importing");
    setError(null);
    const result = await importDetectedDoorsAction({
      jobId,
      doors: selected.map((r) => ({
        name: r.name,
        floor: r.floor,
        items: r.items,
        notes: r.notes,
      })),
      miscNotes,
      standaloneItems,
    });
    if (!result.ok) {
      setError(result.error);
      setPhase("review");
      return;
    }
    onImported(result.created);
    startTransition(() => router.refresh());
    handleClose();
  }

  function handleClose() {
    setPhase("idle");
    setRows([]);
    setMiscNotes([]);
    setStandaloneItems([]);
    setWarnings([]);
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-semibold">
              Auto-detect doors{" "}
              <span className="ml-1 align-baseline text-[10px] font-normal italic text-neutral-400 dark:text-neutral-500">
                Beta
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              From your uploaded site map PDF
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </p>
          )}

          {phase === "detecting" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Spinner />
              <p className="text-sm font-medium">Reading your site map...</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                This usually takes 20–60 seconds.
              </p>
            </div>
          )}

          {phase === "importing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Spinner />
              <p className="text-sm font-medium">Importing doors...</p>
            </div>
          )}

          {phase === "review" && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No doors detected. Try a clearer PDF, or add doors manually.
            </p>
          )}

          {phase === "review" && rows.length > 0 && (
            <>
              {warnings.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                    Count mismatches vs HUGS Symbols legend
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-red-900 dark:text-red-200">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] italic text-red-700/80 dark:text-red-400/80">
                    Review carefully — the model thinks it missed (or over-counted) some dots. You can still import and edit, or close this and run again.
                  </p>
                </div>
              )}
              <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                Found {rows.length} {rows.length === 1 ? "door" : "doors"}. Review
                and uncheck anything wrong before importing. HUGS 8 board is
                added automatically for any door with a 5500 Exciter.
              </p>
              <ul className="space-y-2">
                {rows.map((row, idx) => (
                  <DoorReviewRow
                    key={`${row.name}-${idx}`}
                    row={row}
                    onChange={(patch) =>
                      setRows((current) =>
                        current.map((r, i) =>
                          i === idx ? { ...r, ...patch } : r,
                        ),
                      )
                    }
                  />
                ))}
              </ul>
              {standaloneItems.length > 0 && (
                <div className="mt-4 rounded-lg border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                    Standalone equipment to install
                  </p>
                  <p className="mt-0.5 text-[11px] text-indigo-700/80 dark:text-indigo-400/80">
                    Will be added as a separate &ldquo;Standalone Equipment&rdquo; door so each unit can be checked off.
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-indigo-900 dark:text-indigo-200">
                    {standaloneItems.map((s, i) => (
                      <li key={i}>
                        {s.count} × {s.type}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {miscNotes.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Other devices on the map
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    Appended to job notes on import — not tracked per-door.
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-amber-900 dark:text-amber-200">
                    {miscNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {phase === "review" && rows.length > 0 && (
          <footer className="flex gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
            <button
              type="button"
              onClick={handleClose}
              className="h-12 flex-1 rounded-lg border border-neutral-300 text-sm font-medium dark:border-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runImport}
              className="h-12 flex-1 rounded-lg bg-neutral-900 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Import {rows.filter((r) => r.include).length} doors
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function DoorReviewRow({
  row,
  onChange,
}: {
  row: Row;
  onChange: (patch: Partial<Row>) => void;
}) {
  return (
    <li
      className={
        "rounded-xl border p-3 transition " +
        (row.include
          ? "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"
          : "border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-800 dark:bg-neutral-900")
      }
    >
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={row.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="h-5 w-5 rounded border-neutral-300 dark:border-neutral-700"
        />
        <input
          type="text"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="mt-1 flex items-center gap-2 pl-8">
        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          Floor
        </span>
        <input
          type="text"
          value={row.floor ?? ""}
          placeholder="optional"
          onChange={(e) => onChange({ floor: e.target.value || null })}
          className="h-7 flex-1 rounded border border-neutral-300 bg-white px-2 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
        {row.items.length === 0 ? (
          <span className="text-xs italic text-neutral-400">
            No equipment detected
          </span>
        ) : (
          row.items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() =>
                onChange({ items: row.items.filter((i) => i !== item) })
              }
              className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium dark:bg-neutral-800"
              title="Tap to remove"
            >
              {item} ✕
            </button>
          ))
        )}
      </div>
      {row.items.includes("5500 Exciter") && (
        <p className="mt-1.5 pl-8 text-[11px] text-neutral-500 dark:text-neutral-500">
          + HUGS 8 board (auto-added)
        </p>
      )}
      {row.notes && (
        <p className="mt-1 pl-8 text-[11px] italic text-neutral-500">
          {row.notes}
        </p>
      )}
    </li>
  );
}

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
