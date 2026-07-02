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

  // Export date is stamped once on mount (not during render — that
  // trips the react-hooks purity lint and would also change on every
  // re-render). Drives both the visible header and the filename.
  const [exportedAt, setExportedAt] = useState("");

  // The browser's "Save as PDF" defaults its filename to document.title.
  // Set it to the job name + export date (sanitized for filesystem-
  // friendliness) so the saved file lands as
  // "Acme HQ (1234) - Jan 5 2026.pdf" instead of "localhost-3000.pdf".
  useEffect(() => {
    const now = new Date();
    // "Jan 5, 2026" style, but comma-free so it's filename-safe.
    const dateStr = now
      .toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      .replace(/,/g, "");
    // Capturing the mount-time export date is a legit external sync,
    // not a cascading-render smell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExportedAt(dateStr);

    const prior = document.title;
    const safeName =
      job.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Job report";
    const numberPart = job.number ? ` (${job.number})` : "";
    document.title = `${safeName}${numberPart} - ${dateStr}`;
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
        /* margin:0 leaves the browser no header/footer margin box to
           draw its injected page URL ("link at the bottom") or
           "page 1 of 2" counter into, so they disappear. We put the
           page's breathing room back as padding on the article
           instead (!important to beat the Tailwind px-4/py-4). */
        @page { margin: 0; }
        @media print {
          article { padding: 0.4in !important; }
          .print-toolbar { display: none !important; }
          a { color: inherit; text-decoration: none; }
          .page-break { page-break-before: always; }
          /* Anti-split rules. WebKit's print engine happily slices a
             line of text in half across a page unless every unit that
             must stay whole is marked with BOTH the legacy
             page-break-* and modern break-* forms. */
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          li { page-break-inside: avoid; break-inside: avoid; }
          img, figure { page-break-inside: avoid; break-inside: avoid; }
          h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
          p { orphans: 3; widows: 3; }
          /* Two-up door cards WITHOUT CSS multi-column. A paginated
             multi-column container makes WebKit ignore break-inside on
             its children and slice cards (and their photos) mid-page.
             inline-block cards stay in normal flow, so the print
             paginator honors break-inside: avoid and keeps each card
             — text and photos — whole. font-size:0 on the wrapper
             kills the whitespace gap between the two inline blocks;
             each card resets its own baseline size. */
          .door-cols { font-size: 0; }
          .door-cols > li {
            display: inline-block;
            width: 49%;
            vertical-align: top;
            margin-top: 0;
            margin-bottom: 0.12in;
            font-size: 10px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .door-cols > li:nth-child(odd) { margin-right: 2%; }
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
          onClick={(e) => {
            // iOS Safari (and a couple of Android Chrome builds)
            // refuse a second window.print() call when focus is still
            // on the button that initiated the first one. Drop focus
            // and defer to the next tick — works the first time too,
            // costs nothing.
            (e.currentTarget as HTMLButtonElement).blur();
            setTimeout(() => window.print(), 0);
          }}
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

      <article className="mx-auto max-w-3xl bg-white px-4 py-4 text-neutral-900 print:text-[10px] print:leading-tight">
        <header className="mb-3 border-b border-neutral-300 pb-2">
          <h1 className="text-lg font-bold leading-tight">{job.name}</h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
            {job.number && (
              <span>
                <span className="font-semibold">#</span> {job.number}
              </span>
            )}
            {job.address && (
              <span>
                <span className="font-semibold">Addr:</span> {job.address}
              </span>
            )}
            <span className="text-neutral-500">
              {new Date(job.created_at).toLocaleDateString()} →{" "}
              {new Date(job.updated_at).toLocaleDateString()}
            </span>
            {exportedAt && (
              <span className="text-neutral-500">
                <span className="font-semibold">Exported:</span> {exportedAt}
              </span>
            )}
          </div>
          {job.notes && (
            <p className="mt-1 whitespace-pre-wrap text-[11px]">
              <span className="font-semibold">Notes:</span> {job.notes}
            </p>
          )}
        </header>

        <section className="mb-3">
          <h2 className="mb-2 text-sm font-bold">Doors ({doors.length})</h2>
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
                const itemsWithPhotos = doorItems.filter(
                  (it) => it.photo_storage_path,
                );
                return (
                  <li
                    key={door.id}
                    className="avoid-break rounded border border-neutral-300 p-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-[11px] font-semibold leading-tight">
                        {door.name}
                      </h3>
                      {door.tested_at && (
                        <span className="inline-flex items-center rounded-full border border-emerald-600 px-1 py-0 text-[8px] font-semibold uppercase tracking-wide text-emerald-700">
                          ✓
                        </span>
                      )}
                    </div>
                    {doorItems.length > 0 && (
                      <ul className="mt-1 space-y-0 text-[10px] leading-tight">
                        {doorItems.map((it) => {
                          const done = !!it.completed_at;
                          return (
                            <li
                              key={it.id}
                              className={
                                "flex items-baseline gap-1 " +
                                (done ? "text-neutral-500" : "text-neutral-900")
                              }
                            >
                              <span
                                aria-hidden
                                className={
                                  "w-2 flex-shrink-0 text-[10px] font-semibold leading-none " +
                                  (done ? "text-emerald-600" : "text-neutral-300")
                                }
                              >
                                {done ? "✓" : "○"}
                              </span>
                              <span>
                                {it.name}
                                {(it.ip_address || it.mac_address) && (
                                  <span className="text-neutral-600">
                                    {" "}
                                    [
                                    {[
                                      it.ip_address && `IP ${it.ip_address}`,
                                      it.mac_address && `MAC ${it.mac_address}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                    ]
                                  </span>
                                )}
                                {it.note && (
                                  <span className="text-neutral-500">
                                    {" "}
                                    — {it.note}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {door.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-[10px] leading-tight">
                        <span className="font-semibold">Notes:</span>{" "}
                        {door.notes}
                      </p>
                    )}
                    {includePhotos && doorPhotos.length > 0 && (
                      <div className="mt-1 grid grid-cols-4 gap-0.5">
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
                    )}
                    {includePhotos && itemsWithPhotos.length > 0 && (
                      <div className="mt-1 grid grid-cols-5 gap-0.5">
                        {itemsWithPhotos.map((it) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={it.id}
                            src={publicJobFileUrl(
                              supabaseUrl,
                              it.photo_storage_path as string,
                            )}
                            alt={it.name}
                            title={it.name}
                            className="aspect-square w-full rounded border border-neutral-200 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              };

              if (!useFloorGroups) {
                return (
                  <ul className="door-cols space-y-2">
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
                <div className="space-y-3">
                  {floorOrder.map((floor) => {
                    const floorDoors = printableDoors.filter(
                      (d) => (d.floor ?? null) === floor,
                    );
                    return (
                      <div key={floor ?? "__unassigned"}>
                        <h3 className="mb-1 border-b border-neutral-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-700">
                          {floor ?? "Unassigned"} — {floorDoors.length}{" "}
                          {floorDoors.length === 1 ? "door" : "doors"}
                        </h3>
                        <ul className="door-cols space-y-2">
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
          <section className="avoid-break mb-3">
            <h2 className="mb-1 text-sm font-bold">
              Job photos ({jobPhotos.length})
            </h2>
            <div className="grid grid-cols-5 gap-0.5">
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
