import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  describeJobActivity,
  jobActivityActorName,
  type JobActivity,
} from "@/lib/job-activity";
import {
  ActivityHistoryList,
  type ActivityEntry,
} from "@/components/ActivityHistoryList";

export default async function JobHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: job, error }, { data: activities, error: activityError }] =
    await Promise.all([
      supabase.from("jobs").select("id, name").eq("id", id).single(),
      supabase
        .from("job_activity")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  if (error || !job) notFound();

  const items = (activities ?? []) as JobActivity[];
  const entries: ActivityEntry[] = items.map((a) => ({
    id: a.id,
    created_at: a.created_at,
    actor: jobActivityActorName(a),
    description: describeJobActivity(a),
  }));

  return (
    <>
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
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">History</p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {job.name}
          </h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {activityError ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load history: {activityError.message}
          </p>
        ) : (
          <ActivityHistoryList
            entries={entries}
            emptyMessage="Nothing here yet. Edits to this job's doors, equipment, and photos will show up here once they happen."
          />
        )}
      </section>
    </>
  );
}
