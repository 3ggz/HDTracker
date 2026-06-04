import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { AddJobFab } from "@/components/AddJobFab";
import { LiveUpdater } from "@/components/LiveUpdater";
import { PendingApprovalsBanner } from "@/components/PendingApprovalsBanner";
import { SectionTabs } from "@/components/SectionTabs";
import { isAdminEmail } from "@/lib/admin";

export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

  const [{ data: jobs, error }, pendingApprovals] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, number, address, completed_at, updated_at")
      .order("updated_at", { ascending: false }),
    isAdmin
      ? supabase
          .from("user_approvals")
          .select("*", { count: "exact", head: true })
          .is("approved_at", null)
      : Promise.resolve({ count: 0 }),
  ]);

  const pendingCount =
    isAdmin && "count" in pendingApprovals ? (pendingApprovals.count ?? 0) : 0;

  const allJobs = jobs ?? [];
  const openJobs = allJobs.filter((j) => !j.completed_at);
  const completedJobs = allJobs.filter((j) => j.completed_at);

  return (
    <>
      <LiveUpdater channelName="jobs-list" table="jobs" />
      <AppHeader />
      {isAdmin && <PendingApprovalsBanner initialCount={pendingCount} />}
      <SectionTabs active="jobs" />
      <section className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load jobs: {error.message}
          </p>
        ) : allJobs.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {openJobs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                No open jobs. Everything below is done.
              </p>
            ) : (
              <ul className="space-y-3">
                {openJobs.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </ul>
            )}
            {completedJobs.length > 0 && (
              <div className="mt-8 border-t-2 border-emerald-500 pt-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Completed jobs ({completedJobs.length})
                </h2>
                <ul className="space-y-3">
                  {completedJobs.map((j) => (
                    <JobCard key={j.id} job={j} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      <AddJobFab />
    </>
  );
}

function JobCard({
  job,
}: {
  job: {
    id: string;
    name: string;
    number: string | null;
    address: string | null;
    completed_at: string | null;
  };
}) {
  return (
    <li>
      <Link
        href={`/jobs/${job.id}`}
        className="relative block rounded-2xl border border-neutral-200 bg-white px-4 py-4 pb-7 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p className="text-base font-medium">{job.name}</p>
        {job.number && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            #{job.number}
          </p>
        )}
        {job.address && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {job.address}
          </p>
        )}
        {job.completed_at && (
          <span
            className="absolute bottom-2 right-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
            title={`Completed ${new Date(job.completed_at).toLocaleString()}`}
          >
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
            Completed
          </span>
        )}
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-900">
        <svg
          className="h-8 w-8 text-neutral-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-medium">No jobs yet</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Tap the + button to add your first one.
      </p>
    </div>
  );
}
