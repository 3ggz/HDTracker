"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeImageForUpload } from "@/lib/image-normalize";

// One-off repair for photos uploaded before the upload path converted
// HEIC to JPEG. Those files are stored raw, so Android renders them as
// a broken image icon while iPhones show them fine.
//
// This runs in the browser rather than as a server script on purpose:
// the HEIC decoder is wasm that already ships to the client, so there
// is nothing extra to install and no service-role key to hand around.
// RLS is permissive, so an admin's own session can do the writes.

export type StaleFormatPhoto = {
  id: string;
  table:
    | "job_photos"
    | "vehicle_photos"
    | "faq_photos"
    | "faq_question_photos";
  bucket: string;
  storagePath: string;
};

type RowState = {
  status: "pending" | "working" | "done" | "failed";
  detail?: string;
};

export function PhotoFormatBackfill({
  photos,
}: {
  photos: StaleFormatPhoto[];
}) {
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const setRow = (id: string, state: RowState) =>
    setStates((prev) => ({ ...prev, [id]: state }));

  async function convertOne(photo: StaleFormatPhoto): Promise<void> {
    const supabase = createClient();
    const store = supabase.storage.from(photo.bucket);

    const { data: blob, error: downloadError } = await store.download(
      photo.storagePath,
    );
    if (downloadError || !blob) {
      setRow(photo.id, {
        status: "failed",
        detail: downloadError?.message ?? "Couldn't download the file.",
      });
      return;
    }

    const name = photo.storagePath.split("/").pop() ?? "photo.heic";
    const normalized = await normalizeImageForUpload(
      new File([blob], name, { type: blob.type }),
    );
    if (!normalized.ok) {
      setRow(photo.id, { status: "failed", detail: normalized.error });
      return;
    }

    const newPath = photo.storagePath.replace(/\.[^./]+$/, "") + ".jpg";
    if (newPath === photo.storagePath) {
      setRow(photo.id, { status: "failed", detail: "Unexpected path shape." });
      return;
    }

    const { error: uploadError } = await store.upload(
      newPath,
      normalized.file,
      { upsert: true, contentType: "image/jpeg" },
    );
    if (uploadError) {
      setRow(photo.id, { status: "failed", detail: uploadError.message });
      return;
    }

    const { error: updateError } = await supabase
      .from(photo.table)
      .update({ storage_path: newPath })
      .eq("id", photo.id);
    if (updateError) {
      // The row still points at the old file, so drop the copy we just
      // made rather than leaving two versions behind.
      await store.remove([newPath]);
      setRow(photo.id, { status: "failed", detail: updateError.message });
      return;
    }

    // Best effort — an orphaned original costs storage, nothing else.
    await store.remove([photo.storagePath]);
    setRow(photo.id, { status: "done" });
  }

  async function run() {
    setRunning(true);
    // Sequential: a jobsite phone converting dozens of 12 MP photos in
    // parallel will run itself out of memory.
    for (const photo of photos) {
      setRow(photo.id, { status: "working" });
      try {
        await convertOne(photo);
      } catch (e) {
        setRow(photo.id, {
          status: "failed",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setRunning(false);
    setFinished(true);
  }

  const done = photos.filter((p) => states[p.id]?.status === "done").length;
  const failed = photos.filter((p) => states[p.id]?.status === "failed").length;

  if (photos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No photos need converting. Everything in storage is in a format
        every phone can display.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {photos.length} {photos.length === 1 ? "photo is" : "photos are"}{" "}
          stored as HEIC. Android phones show these as a broken image icon.
          Converting rewrites them as JPEG.
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Keep this tab open until it finishes. Safe to run more than
          once — anything already converted is skipped.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {running
            ? `Converting… ${done + failed} of ${photos.length}`
            : finished
              ? "Run again"
              : `Convert ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
        </button>
        {(done > 0 || failed > 0) && (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            {done} converted{failed > 0 ? `, ${failed} failed` : ""}.
            {finished && done > 0 && " Reload the job or vehicle to see them."}
          </p>
        )}
      </div>

      <ul className="space-y-1">
        {photos.map((photo) => {
          const state = states[photo.id]?.status ?? "pending";
          return (
            <li
              key={`${photo.table}:${photo.id}`}
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
                  {photo.table.replaceAll("_", " ")}
                  {states[photo.id]?.detail
                    ? ` · ${states[photo.id]?.detail}`
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
