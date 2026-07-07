import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { publicJobFileUrl, type JobPhoto } from "@/lib/job-photos";
import {
  compareCanonicalItems,
  compareDoorNames,
  type Job,
  type JobDoor,
  type JobDoorItem,
} from "@/lib/jobs";

// Public read-only job summary, addressed by the job's share_token
// rather than its id. The token in the URL is the credential — no
// session required (middleware whitelists /share). Deliberately no
// Edit links, no LiveUpdater, no editor affordances: this page is
// what a GC or customer sees when a tech texts them the link.
export default async function SharedJobPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Tokens are uuids; refuse anything that doesn't look like one so
  // arbitrary strings don't produce a Postgres cast error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    notFound();
  }
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();

  if (jobError || !job) notFound();

  const [{ data: doors }, { data: photos }] = await Promise.all([
    supabase
      .from("job_doors")
      .select("*")
      .eq("job_id", job.id)
      .order("position", { ascending: true }),
    supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false }),
  ]);

  const doorIds = (doors ?? []).map((d) => d.id);
  const { data: items } =
    doorIds.length === 0
      ? { data: [] as JobDoorItem[] }
      : await supabase
          .from("job_door_items")
          .select("*")
          .in("door_id", doorIds)
          .order("position", { ascending: true });

  const allItems = (items ?? []) as JobDoorItem[];
  const totalItems = allItems.length;
  const completedItems = allItems.filter((it) => it.completed_at).length;
  const pct =
    totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const itemsByDoor = new Map<string, JobDoorItem[]>();
  for (const it of allItems) {
    const list = itemsByDoor.get(it.door_id) ?? [];
    list.push(it);
    itemsByDoor.set(it.door_id, list);
  }
  for (const list of itemsByDoor.values()) {
    list.sort(compareCanonicalItems);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const STANDALONE_DOOR_NAME = "Standalone Equipment";
  const allDoors = (doors ?? []) as JobDoor[];
  const regularDoors = allDoors.filter(
    (d) => d.name !== STANDALONE_DOOR_NAME,
  );
  const standaloneDoor = allDoors.find(
    (d) => d.name === STANDALONE_DOOR_NAME,
  );
  const sortedDoors = [...regularDoors].sort((a, b) =>
    compareDoorNames(a.name, b.name),
  );
  const jobPhotos = ((photos ?? []) as JobPhoto[]).filter((p) => !p.door_id);
  const typedJob = job as Job;

  const exportedAt = new Date()
    .toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    .replace(/,/g, "");

  return (
    <>
      <style>{`
        @page { margin: 0.4in; }
        @media print {
          .share-toolbar { display: none !important; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          li { page-break-inside: avoid; break-inside: avoid; }
          img { page-break-inside: avoid; break-inside: avoid; }
          h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
          p { orphans: 3; widows: 3; }
          body { background: white; }
        }
      `}</style>

      <header className="share-toolbar sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Shared job view
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {typedJob.name}
          </h1>
        </div>
        <ExportPdfButton
          documentTitle={`${typedJob.name}${typedJob.number ? ` (${typedJob.number})` : ""} - ${exportedAt}`}
        />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-12 pt-4">
        {/* Print-only title block — the sticky header is hidden in
            print, so without this the PDF would have no job name. */}
        <div className="hidden print:mb-2 print:block">
          <h2 className="text-lg font-bold leading-tight">{typedJob.name}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {typedJob.number && <>#{typedJob.number} · </>}Exported{" "}
            {exportedAt}
          </p>
        </div>

        <section className="avoid-break rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          {(typedJob.number || typedJob.address) && (
            <div className="mb-3 space-y-0.5 text-sm">
              {typedJob.number && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Job #{" "}
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {typedJob.number}
                  </span>
                </p>
              )}
              {typedJob.address && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  {typedJob.address}
                </p>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Progress
            </span>
            <span className="text-2xl font-bold tabular-nums">{pct}%</span>
          </div>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            {completedItems} of {totalItems} items done across{" "}
            {sortedDoors.length} {sortedDoors.length === 1 ? "door" : "doors"}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </section>

        {sortedDoors.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No doors yet.
          </p>
        ) : (
          <section className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Doors (A→Z)
            </h2>
            <ul className="space-y-2">
              {sortedDoors.map((door) => {
                const doorItems = itemsByDoor.get(door.id) ?? [];
                const doorDone = doorItems.filter(
                  (it) => it.completed_at,
                ).length;
                return (
                  <li
                    key={door.id}
                    className="avoid-break relative rounded-xl border border-neutral-200 bg-white p-3 pb-7 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{door.name}</h3>
                      {doorItems.length > 0 && (
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                            (doorDone === doorItems.length
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                              : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
                          }
                        >
                          {doorDone}/{doorItems.length}
                        </span>
                      )}
                    </div>
                    {doorItems.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {doorItems.map((it) => (
                          <li
                            key={it.id}
                            className={
                              "flex items-center gap-1.5 " +
                              (it.completed_at
                                ? "text-neutral-400 dark:text-neutral-500"
                                : "text-neutral-700 dark:text-neutral-300")
                            }
                          >
                            <span
                              aria-hidden
                              className={
                                it.completed_at
                                  ? "text-emerald-600 dark:text-emerald-500"
                                  : ""
                              }
                            >
                              {it.completed_at ? "✓" : "○"}
                            </span>
                            <span>{it.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {door.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                        {door.notes}
                      </p>
                    )}
                    {door.tested_at && (
                      <span className="absolute bottom-1.5 right-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Tested
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {standaloneDoor && (
          <section className="avoid-break rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Standalone equipment
            </h2>
            {(() => {
              const sItems = itemsByDoor.get(standaloneDoor.id) ?? [];
              if (sItems.length === 0) {
                return (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No items.
                  </p>
                );
              }
              const sDone = sItems.filter((it) => it.completed_at).length;
              return (
                <>
                  <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {sDone} / {sItems.length} installed
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {sItems.map((it) => (
                      <li
                        key={it.id}
                        className={
                          "flex items-center gap-1.5 " +
                          (it.completed_at
                            ? "text-neutral-400 dark:text-neutral-500"
                            : "text-neutral-700 dark:text-neutral-300")
                        }
                      >
                        <span aria-hidden>
                          {it.completed_at ? "✓" : "○"}
                        </span>
                        <span>{it.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </section>
        )}

        {jobPhotos.length > 0 && (
          <section className="avoid-break rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Job photos
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {jobPhotos.slice(0, 9).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  loading="lazy"
                  decoding="async"
                  key={p.id}
                  src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                  alt=""
                  className="aspect-square w-full rounded border border-neutral-200 object-cover dark:border-neutral-800"
                />
              ))}
            </div>
          </section>
        )}

        <p className="share-toolbar pt-2 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          Read-only view shared from HDTracker.
        </p>
      </main>
    </>
  );
}
