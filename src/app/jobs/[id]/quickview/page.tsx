import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveUpdater } from "@/components/LiveUpdater";
import { publicJobFileUrl, type JobPhoto } from "@/lib/job-photos";
import {
  compareCanonicalItems,
  compareDoorNames,
  type Job,
  type JobDoor,
  type JobDoorItem,
} from "@/lib/jobs";

export default async function JobQuickViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: job, error: jobError },
    { data: doors },
    { data: photos },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase
      .from("job_doors")
      .select("*")
      .eq("job_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (jobError || !job) notFound();

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
  const pct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const itemsByDoor = new Map<string, JobDoorItem[]>();
  for (const it of allItems) {
    const list = itemsByDoor.get(it.door_id) ?? [];
    list.push(it);
    itemsByDoor.set(it.door_id, list);
  }
  for (const list of itemsByDoor.values()) {
    list.sort(compareCanonicalItems);
  }

  const deviceStats = new Map<string, { done: number; total: number }>();
  for (const it of allItems) {
    const stat = deviceStats.get(it.name) ?? { done: 0, total: 0 };
    stat.total++;
    if (it.completed_at) stat.done++;
    deviceStats.set(it.name, stat);
  }
  const deviceRows = Array.from(deviceStats.entries())
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) =>
      compareCanonicalItems(
        { name: a.name, position: 0 },
        { name: b.name, position: 0 },
      ),
    );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const STANDALONE_DOOR_NAME = "Standalone Equipment";
  const allDoors = (doors ?? []) as JobDoor[];
  const regularDoors = allDoors.filter((d) => d.name !== STANDALONE_DOOR_NAME);
  const standaloneDoor = allDoors.find(
    (d) => d.name === STANDALONE_DOOR_NAME,
  );
  const sortedDoors = [...regularDoors].sort((a, b) =>
    compareDoorNames(a.name, b.name),
  );
  const jobPhotos = ((photos ?? []) as JobPhoto[]).filter((p) => !p.door_id);

  return (
    <>
      <LiveUpdater
        channelName={`qv-job-${job.id}-meta`}
        table="jobs"
        filter={`id=eq.${job.id}`}
      />
      <LiveUpdater
        channelName={`qv-job-${job.id}-doors`}
        table="job_doors"
        filter={`job_id=eq.${job.id}`}
      />
      <LiveUpdater
        channelName={`qv-job-${job.id}-items`}
        table="job_door_items"
      />
      <LiveUpdater
        channelName={`qv-job-${job.id}-photos`}
        table="job_photos"
        filter={`job_id=eq.${job.id}`}
      />

      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href={`/jobs/${job.id}`}
          aria-label="Back"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full active:bg-neutral-200/60 dark:active:bg-neutral-800/60"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className="truncate flex-1 text-base font-semibold tracking-tight">
          {(job as Job).name}
        </h1>
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
        >
          Edit
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-12 pt-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          {((job as Job).number || (job as Job).address) && (
            <div className="mb-3 space-y-0.5 text-sm">
              {(job as Job).number && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Job # <span className="font-medium text-neutral-900 dark:text-neutral-100">{(job as Job).number}</span>
                </p>
              )}
              {(job as Job).address && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  {(job as Job).address}
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
            {completedItems} of {totalItems} items done across {sortedDoors.length}{" "}
            {sortedDoors.length === 1 ? "door" : "doors"}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </section>

        {deviceRows.length > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              By device
            </h2>
            <ul className="space-y-2">
              {deviceRows.map((row) => {
                const pct =
                  row.total === 0
                    ? 0
                    : Math.round((row.done / row.total) * 100);
                const allDone = row.done === row.total;
                return (
                  <li key={row.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {row.name}
                      </span>
                      <span
                        className={
                          "tabular-nums text-xs font-medium " +
                          (allDone
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-neutral-600 dark:text-neutral-400")
                        }
                      >
                        {row.done} / {row.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className={
                          "h-full transition-all " +
                          (allDone ? "bg-emerald-500" : "bg-neutral-500")
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
                const doorDone = doorItems.filter((it) => it.completed_at).length;
                return (
                  <li
                    key={door.id}
                    className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
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
                                ? "text-neutral-400 line-through dark:text-neutral-500"
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
                    )}
                    {door.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                        {door.notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {standaloneDoor && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Standalone equipment
            </h2>
            {(() => {
              const sItems = itemsByDoor.get(standaloneDoor.id) ?? [];
              const sDone = sItems.filter((it) => it.completed_at).length;
              if (sItems.length === 0) {
                return (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No items.
                  </p>
                );
              }
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
                            ? "text-neutral-400 line-through dark:text-neutral-500"
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
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Job photos
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {jobPhotos.slice(0, 9).map((p) => (
                <a
                  key={p.id}
                  href={publicJobFileUrl(supabaseUrl, p.storage_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
