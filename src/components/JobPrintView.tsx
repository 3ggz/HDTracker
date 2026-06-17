"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { publicJobFileUrl, type JobPhoto } from "@/lib/job-photos";
import {
  compareCanonicalItems,
  type Job,
  type JobDoor,
  type JobDoorItem,
} from "@/lib/jobs";

export function JobPrintView({
  job,
  doors,
  items,
  photos,
  itemPhotoPaths,
}: {
  job: Job;
  doors: JobDoor[];
  items: JobDoorItem[];
  photos: JobPhoto[];
  itemPhotoPaths: string[];
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // The browser's "Save as PDF" defaults its filename to document.title.
  // Set it to the job name (sanitized for filesystem-friendliness) so
  // the saved file lands as "Acme HQ.pdf" instead of "localhost-3000.pdf".
  useEffect(() => {
    const prior = document.title;
    const safeName =
      job.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Job report";
    document.title = job.number ? `${safeName} (${job.number})` : safeName;
    return () => {
      document.title = prior;
    };
  }, [job.name, job.number]);

  // Default the map toggle on only when the job actually has one
  // uploaded — otherwise the checkbox is a no-op.
  const [includeMap, setIncludeMap] = useState<boolean>(!!job.site_map_path);
  // Photos on by default since the report usually wants them; flipping
  // off is the "lean PDF for emailing" path. Suppresses the door
  // photo grid, the per-door item photo strip, and the trailing job
  // photo gallery.
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);

  // No auto-print: the user picks include-map first, then taps Print
  // when they're ready. Previously this fired window.print() on mount
  // which left no chance to change the toggle.

  const jobPhotos = photos.filter((p) => !p.door_id);
  const itemsByDoor = new Map<string, JobDoorItem[]>();
  for (const it of items) {
    const list = itemsByDoor.get(it.door_id) ?? [];
    list.push(it);
    itemsByDoor.set(it.door_id, list);
  }
  for (const list of itemsByDoor.values()) {
    list.sort(compareCanonicalItems);
  }

  return (
    <>
      <style>{`
        @page { margin: 0.5in; }
        @media print {
          .print-toolbar { display: none !important; }
          a { color: inherit; text-decoration: none; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
        }
        body { background: white; }
      `}</style>

      <div className="print-toolbar sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm font-medium text-neutral-600 active:text-neutral-900"
        >
          ← Back
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
            />
            Include photos
          </label>
          {job.site_map_path && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={includeMap}
                onChange={(e) => setIncludeMap(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              />
              Include site map
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          // window.print() is the export path on every modern browser —
          // it opens the system Save-as-PDF dialog on iOS/Android/macOS/
          // Windows so the user always gets a file, never a paper job.
          // The label says 'Export PDF' instead of 'Print' to match that
          // expectation.
          className="flex h-9 items-center gap-1 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 18 15 15" />
          </svg>
          Export PDF
        </button>
      </div>

      <article className="mx-auto max-w-3xl bg-white px-6 py-8 text-neutral-900">
        <header className="mb-6 border-b border-neutral-300 pb-4">
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {job.number && (
              <p>
                <span className="font-semibold">Job #:</span> {job.number}
              </p>
            )}
            {job.address && (
              <p className="col-span-2">
                <span className="font-semibold">Address:</span> {job.address}
              </p>
            )}
            <p>
              <span className="font-semibold">Created:</span>{" "}
              {new Date(job.created_at).toLocaleDateString()}
            </p>
            <p>
              <span className="font-semibold">Updated:</span>{" "}
              {new Date(job.updated_at).toLocaleDateString()}
            </p>
          </div>
          {job.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm">
              <span className="font-semibold">Notes:</span> {job.notes}
            </p>
          )}
        </header>

        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">Doors ({doors.length})</h2>
          {doors.length === 0 ? (
            <p className="text-sm text-neutral-500">No doors recorded.</p>
          ) : (
            (() => {
              // Group by floor when any door has one set. Floors sort
              // naturally (1, 2, 10, B, etc) with null/Unassigned last.
              const STANDALONE = "Standalone Equipment";
              const printableDoors = doors.filter(
                (d) => d.name !== STANDALONE,
              );
              const distinctFloors = Array.from(
                new Set(printableDoors.map((d) => d.floor ?? null)),
              );
              const useFloorGroups =
                distinctFloors.length > 1 ||
                (distinctFloors.length === 1 && distinctFloors[0] !== null);

              const renderDoor = (door: JobDoor) => {
                const doorItems = itemsByDoor.get(door.id) ?? [];
                const doorPhotos = photos.filter((p) => p.door_id === door.id);
                return (
                  <li
                    key={door.id}
                    className="avoid-break rounded border border-neutral-300 p-3"
                  >
                    <h3 className="text-base font-semibold">{door.name}</h3>
                    {doorItems.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Equipment
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                          {doorItems.map((it) => (
                            <li key={it.id}>
                              {it.name}
                              {it.note && (
                                <span className="text-neutral-600">
                                  {" "}
                                  — {it.note}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {door.notes && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Notes
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">
                          {door.notes}
                        </p>
                      </div>
                    )}
                    {includePhotos && doorPhotos.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Photos
                        </p>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {doorPhotos.map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={p.id}
                              src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                              alt=""
                              className="aspect-square w-full rounded border border-neutral-200 object-cover"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {includePhotos &&
                      doorItems.some((it) => it.photo_storage_path) && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Item photos
                        </p>
                        <div className="mt-1 grid grid-cols-4 gap-1.5">
                          {doorItems
                            .filter((it) => it.photo_storage_path)
                            .map((it) => (
                              <figure key={it.id}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={publicJobFileUrl(
                                    supabaseUrl,
                                    it.photo_storage_path as string,
                                  )}
                                  alt={it.name}
                                  className="aspect-square w-full rounded border border-neutral-200 object-cover"
                                />
                                <figcaption className="mt-0.5 text-[10px] text-neutral-600">
                                  {it.name}
                                </figcaption>
                              </figure>
                            ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              };

              if (!useFloorGroups) {
                return (
                  <ul className="space-y-4">
                    {printableDoors.map(renderDoor)}
                  </ul>
                );
              }

              const floorOrder = distinctFloors.sort((a, b) => {
                if (a === null) return 1;
                if (b === null) return -1;
                return a.localeCompare(b, undefined, { numeric: true });
              });

              return (
                <div className="space-y-6">
                  {floorOrder.map((floor) => {
                    const floorDoors = printableDoors.filter(
                      (d) => (d.floor ?? null) === floor,
                    );
                    return (
                      <div key={floor ?? "__unassigned"}>
                        <h3 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide text-neutral-700">
                          {floor ?? "Unassigned"} — {floorDoors.length}{" "}
                          {floorDoors.length === 1 ? "door" : "doors"}
                        </h3>
                        <ul className="space-y-4">
                          {floorDoors.map(renderDoor)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </section>

        {includePhotos && jobPhotos.length > 0 && (
          <section className="avoid-break mb-6">
            <h2 className="mb-3 text-lg font-bold">
              Job photos ({jobPhotos.length})
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {jobPhotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                  alt={p.caption ?? ""}
                  className="aspect-square w-full rounded border border-neutral-200 object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {job.site_map_path && includeMap && (
          <section className="page-break">
            <h2 className="mb-3 text-lg font-bold">Site map</h2>
            <object
              data={publicJobFileUrl(supabaseUrl, job.site_map_path)}
              type="application/pdf"
              className="h-[9in] w-full border border-neutral-300"
              aria-label="Site map PDF"
            />
          </section>
        )}

        {itemPhotoPaths.length === 0 && jobPhotos.length === 0 && (
          <p className="mt-8 text-center text-xs text-neutral-400">
            End of report
          </p>
        )}
      </article>
    </>
  );
}
