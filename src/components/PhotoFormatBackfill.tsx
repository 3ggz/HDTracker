"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  needsConversion,
  normalizeImageForUpload,
  sniffImageKind,
  type ImageKind,
} from "@/lib/image-normalize";

// One-off repair for photos uploaded before the upload path converted
// HEIC to JPEG. Those files are stored raw, so Android renders them as
// a broken image icon while iPhones show them fine.
//
// Two passes. First a scan that reads the first 32 bytes of every
// photo over HTTP Range and identifies it by its actual magic bytes —
// the filename and the stored content type both come from the phone's
// picker and both lie. Then a conversion pass over whatever the scan
// flagged.
//
// It runs in the browser rather than as a server script on purpose:
// the HEIC decoder is wasm that already ships to the client, so there
// is nothing extra to install and no service-role key to hand around.
// RLS is permissive, so an admin's own session can do the writes.

export type CandidatePhoto = {
  id: string;
  table:
    | "job_photos"
    | "vehicle_photos"
    | "faq_photos"
    | "faq_question_photos";
  bucket: string;
  storagePath: string;
  url: string;
};

type RowState = {
  status: "working" | "done" | "failed";
  detail?: string;
};

const SCAN_CONCURRENCY = 8;
const SNIFF_BYTES = 32;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onProgress?: () => void,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
        onProgress?.();
      }
    })(),
  );
  await Promise.all(workers);
  return out;
}

async function sniffRemote(url: string): Promise<ImageKind> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
    });
    if (!res.ok && res.status !== 206) return "unknown";
    const buf = await res.arrayBuffer();
    return sniffImageKind(new Uint8Array(buf));
  } catch {
    return "unknown";
  }
}

export function PhotoFormatBackfill({ photos }: { photos: CandidatePhoto[] }) {
  const [scanned, setScanned] = useState(0);
  const [scanning, setScanning] = useState(true);
  const [stale, setStale] = useState<{ photo: CandidatePhoto; kind: ImageKind }[]>(
    [],
  );
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  const key = (p: CandidatePhoto) => `${p.table}:${p.id}`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    void (async () => {
      let seen = 0;
      const kinds = await mapWithConcurrency(
        photos,
        SCAN_CONCURRENCY,
        (p) => sniffRemote(p.url),
        () => {
          seen++;
          if (!cancelled && seen % 5 === 0) setScanned(seen);
        },
      );
      if (cancelled) return;
      setScanned(photos.length);
      setStale(
        photos
          .map((photo, i) => ({ photo, kind: kinds[i] }))
          .filter((r) => needsConversion(r.kind)),
      );
      setScanning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const setRow = useCallback(
    (k: string, state: RowState) =>
      setStates((prev) => ({ ...prev, [k]: state })),
    [],
  );

  async function convertOne(photo: CandidatePhoto): Promise<void> {
    const k = key(photo);
    const supabase = createClient();
    const store = supabase.storage.from(photo.bucket);

    const { data: blob, error: downloadError } = await store.download(
      photo.storagePath,
    );
    if (downloadError || !blob) {
      setRow(k, {
        status: "failed",
        detail: downloadError?.message ?? "Couldn't download the file.",
      });
      return;
    }

    const name = photo.storagePath.split("/").pop() ?? "photo.heic";
    const normalized = await normalizeImageForUpload(
      // The stored content type is part of what's wrong, so force the
      // name to look like HEIC and let the decoder judge the bytes.
      new File([blob], /\.(heic|heif)$/i.test(name) ? name : `${name}.heic`, {
        type: "image/heic",
      }),
    );
    if (!normalized.ok) {
      setRow(k, { status: "failed", detail: normalized.error });
      return;
    }

    const newPath = photo.storagePath.replace(/\.[^./]+$/, "") + ".jpg";
    const { error: uploadError } = await store.upload(
      newPath,
      normalized.file,
      { upsert: true, contentType: "image/jpeg" },
    );
    if (uploadError) {
      setRow(k, { status: "failed", detail: uploadError.message });
      return;
    }

    if (newPath !== photo.storagePath) {
      const { error: updateError } = await supabase
        .from(photo.table)
        .update({ storage_path: newPath })
        .eq("id", photo.id);
      if (updateError) {
        // The row still points at the old file, so drop the copy we
        // just made rather than leaving two versions behind.
        await store.remove([newPath]);
        setRow(k, { status: "failed", detail: updateError.message });
        return;
      }
      // Best effort — an orphaned original costs storage, nothing else.
      await store.remove([photo.storagePath]);
    }

    setRow(k, { status: "done" });
  }

  async function run() {
    setRunning(true);
    // Sequential: a jobsite phone converting dozens of 12 MP photos in
    // parallel will run itself out of memory.
    for (const { photo } of stale) {
      setRow(key(photo), { status: "working" });
      try {
        await convertOne(photo);
      } catch (e) {
        setRow(key(photo), {
          status: "failed",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setRunning(false);
    setFinished(true);
  }

  if (scanning) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-medium">Checking photos…</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Reading the first few bytes of each file to see what format it
          really is. {scanned} of {photos.length}.
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-[width] dark:bg-neutral-100"
            style={{
              width: `${photos.length ? (scanned / photos.length) * 100 : 100}%`,
            }}
          />
        </div>
      </div>
    );
  }

  const done = stale.filter((s) => states[key(s.photo)]?.status === "done")
    .length;
  const failed = stale.filter(
    (s) => states[key(s.photo)]?.status === "failed",
  ).length;

  if (stale.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Checked {photos.length}{" "}
        {photos.length === 1 ? "photo" : "photos"} — every one is already in
        a format any phone can display.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {stale.length} of {photos.length}{" "}
          {stale.length === 1 ? "photo isn't" : "photos aren't"} in a format
          Android can display. Converting rewrites them as JPEG.
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Keep this tab open until it finishes. Safe to run more than
          once — anything already converted is skipped next time.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {running
            ? `Converting… ${done + failed} of ${stale.length}`
            : finished
              ? "Run again"
              : `Convert ${stale.length} ${stale.length === 1 ? "photo" : "photos"}`}
        </button>
        {(done > 0 || failed > 0) && (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            {done} converted{failed > 0 ? `, ${failed} failed` : ""}.
            {finished && done > 0 && " Reload the job or vehicle to see them."}
          </p>
        )}
      </div>

      <ul className="space-y-1">
        {stale.map(({ photo, kind }) => {
          const state = states[key(photo)]?.status;
          return (
            <li
              key={key(photo)}
              className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span
                aria-hidden
                className={
                  state === "done"
                    ? "text-emerald-600 dark:text-emerald-500"
                    : state === "failed"
                      ? "text-red-600 dark:text-red-500"
                      : "text-neutral-400"
                }
              >
                {state === "done"
                  ? "✓"
                  : state === "failed"
                    ? "✕"
                    : state === "working"
                      ? "…"
                      : "○"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-all text-neutral-700 dark:text-neutral-300">
                  {photo.storagePath}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {photo.table.replaceAll("_", " ")} ·{" "}
                  {kind === "heif" ? "HEIC" : "unrecognised"}
                  {states[key(photo)]?.detail
                    ? ` · ${states[key(photo)]?.detail}`
                    : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
