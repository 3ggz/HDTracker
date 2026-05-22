import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  activityActorName,
  describeVehicleActivity,
  formatRelativeTime,
  groupActivitiesByDay,
  type VehicleActivity,
} from "@/lib/vehicle-activity";

export default async function VehicleHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: vehicle, error }, { data: activities, error: activityError }] =
    await Promise.all([
      supabase.from("vehicles").select("id, name").eq("id", id).single(),
      supabase
        .from("vehicle_activity")
        .select("*")
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  if (error || !vehicle) notFound();

  const items = (activities ?? []) as VehicleActivity[];
  const groups = groupActivitiesByDay(items);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href={`/vehicles/${vehicle.id}`}
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
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            History
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {vehicle.name}
          </h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {activityError && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load history: {activityError.message}
          </p>
        )}

        {!activityError && items.length === 0 && (
          <p className="mt-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Nothing here yet. Edits to this vehicle&apos;s details, inventory,
            and issues will show up here once they happen.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {group.label}
            </h2>
            <ul className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              {group.activities.map((activity, i) => (
                <li
                  key={activity.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    i > 0
                      ? "border-t border-neutral-200 dark:border-neutral-800"
                      : ""
                  }`}
                >
                  <div className="w-16 flex-shrink-0 leading-tight">
                    <time
                      dateTime={activity.created_at}
                      className="block text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                    >
                      {formatRelativeTime(activity.created_at)}
                    </time>
                    <span className="mt-0.5 block text-[10px] text-neutral-400 dark:text-neutral-500">
                      {activityActorName(activity)}
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 text-sm text-neutral-800 dark:text-neutral-200">
                    {describeVehicleActivity(activity)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
