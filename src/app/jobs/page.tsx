import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { AddJobFab } from "@/components/AddJobFab";
import { LiveUpdater } from "@/components/LiveUpdater";
import { PendingApprovalsBanner } from "@/components/PendingApprovalsBanner";
import { SectionTabs } from "@/components/SectionTabs";
import { JobsListClient } from "@/components/JobsListClient";
import { PullToRefresh } from "@/components/PullToRefresh";
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

  return (
    <>
      <LiveUpdater channelName="jobs-list" table="jobs" />
      <AppHeader />
      {isAdmin && <PendingApprovalsBanner initialCount={pendingCount} />}
      <SectionTabs active="jobs" />
      <section className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        <PullToRefresh>
          {error ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Couldn&apos;t load jobs: {error.message}
            </p>
          ) : (
            <JobsListClient jobs={jobs ?? []} />
          )}
        </PullToRefresh>
      </section>
      <AddJobFab />
    </>
  );
}
