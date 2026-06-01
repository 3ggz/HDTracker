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
      .select("id, name, number, address, updated_at")
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
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white px-4 py-4 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <p className="text-base font-medium">{j.name}</p>
                  {j.number && (
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      #{j.number}
                    </p>
                  )}
                  {j.address && (
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {j.address}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AddJobFab />
    </>
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
