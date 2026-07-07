import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { AddVehicleFab } from "@/components/AddVehicleFab";
import { LiveUpdater } from "@/components/LiveUpdater";
import { PendingApprovalsBanner } from "@/components/PendingApprovalsBanner";
import { PendingResetsBanner } from "@/components/PendingResetsBanner";
import { SectionTabs } from "@/components/SectionTabs";
import { isAdminEmail } from "@/lib/admin";

export default async function VehiclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

  const [{ data: vehicles, error }, pendingApprovals, pendingResets] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("id, name, location_label, last_worked_job, updated_at")
        .order("updated_at", { ascending: false }),
      isAdmin
        ? supabase
            .from("user_approvals")
            .select("*", { count: "exact", head: true })
            .is("approved_at", null)
        : Promise.resolve({ count: 0 }),
      isAdmin
        ? supabase
            .from("password_reset_requests")
            .select("*", { count: "exact", head: true })
            .is("approved_at", null)
            .gt(
              "requested_at",
              // Server component — runs once per request, so a
              // wall-clock read is fine here despite the rule.
              // eslint-disable-next-line react-hooks/purity
              new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            )
        : Promise.resolve({ count: 0 }),
    ]);

  const pendingCount =
    isAdmin && "count" in pendingApprovals ? (pendingApprovals.count ?? 0) : 0;
  const pendingResetCount =
    isAdmin && "count" in pendingResets ? (pendingResets.count ?? 0) : 0;

  return (
    <>
      <LiveUpdater channelName="home-vehicles" table="vehicles" />
      <AppHeader showQuickView />
      {isAdmin && <PendingApprovalsBanner initialCount={pendingCount} />}
      {isAdmin && (
        <PendingResetsBanner initialCount={pendingResetCount} />
      )}
      <SectionTabs active="vehicles" />
      <section className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load vehicles: {error.message}
          </p>
        ) : !vehicles || vehicles.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/vehicles/${v.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white px-4 py-4 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <p className="text-base font-medium">{v.name}</p>
                  {v.location_label && (
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {v.location_label}
                    </p>
                  )}
                  {v.last_worked_job && (
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      Last job: {v.last_worked_job}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AddVehicleFab />
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
          <path d="M3 17h2.5a1.5 1.5 0 0 0 3 0h7a1.5 1.5 0 0 0 3 0H21V8l-3-3H6L3 8v9Z" />
          <circle cx="7.5" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-medium">No vehicles yet</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Tap the + button to add your first one.
      </p>
    </div>
  );
}
