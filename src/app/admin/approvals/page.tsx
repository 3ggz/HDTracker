import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApprovalRow } from "@/components/ApprovalRow";
import { ResetRequestRow } from "@/components/ResetRequestRow";
import { LiveUpdater } from "@/components/LiveUpdater";
import { isAdminEmail } from "@/lib/admin";

// Anything in pending state older than this is shelved under
// "Expired" instead of sitting in the actionable queue forever.
const RESET_EXPIRY_MS = 30 * 60 * 1000;

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) notFound();

  const [
    { data: approvals, error: approvalsError },
    { data: resets, error: resetsError },
  ] = await Promise.all([
    supabase
      .from("user_approvals")
      .select("user_id, email, approved_at, denied_at, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("password_reset_requests")
      .select("id, email, requested_at, approved_at, fulfilled_at")
      .order("requested_at", { ascending: false })
      .limit(50),
  ]);

  const approvalRows = approvals ?? [];
  const pendingApprovals = approvalRows.filter(
    (a) => !a.approved_at && !a.denied_at,
  );
  const approvedAccounts = approvalRows.filter((a) => a.approved_at);
  const deniedAccounts = approvalRows.filter(
    (a) => a.denied_at && !a.approved_at,
  );

  const resetRows = resets ?? [];
  const now = Date.now();
  const isPendingAndFresh = (r: { approved_at: string | null; requested_at: string }) =>
    !r.approved_at &&
    now - new Date(r.requested_at).getTime() <= RESET_EXPIRY_MS;
  const isExpired = (r: {
    approved_at: string | null;
    requested_at: string;
    fulfilled_at: string | null;
  }) =>
    !r.fulfilled_at &&
    !r.approved_at &&
    now - new Date(r.requested_at).getTime() > RESET_EXPIRY_MS;
  const pendingResets = resetRows.filter(isPendingAndFresh);
  const waitingResets = resetRows.filter(
    (r) => r.approved_at && !r.fulfilled_at,
  );
  const fulfilledResets = resetRows.filter((r) => r.fulfilled_at);
  const expiredResets = resetRows.filter(isExpired);

  return (
    <>
      <LiveUpdater channelName="admin-approvals" table="user_approvals" />
      <LiveUpdater
        channelName="admin-resets"
        table="password_reset_requests"
      />
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href="/"
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
        <h1 className="flex-1 truncate text-base font-semibold tracking-tight">
          Approvals
        </h1>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 space-y-8 px-4 py-6">
        {(approvalsError || resetsError) && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load:{" "}
            {approvalsError?.message ?? resetsError?.message}
          </p>
        )}

        <div className="space-y-4">
          <div className="border-b border-neutral-200 pb-1 dark:border-neutral-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Account approvals
            </h2>
          </div>

          <Section
            title={`Pending (${pendingApprovals.length})`}
            empty="No accounts waiting."
          >
            {pendingApprovals.map((a) => (
              <ApprovalRow key={a.user_id} approval={a} />
            ))}
          </Section>

          <Section
            title={`Approved (${approvedAccounts.length})`}
            empty="None yet."
          >
            {approvedAccounts.map((a) => (
              <ApprovalRow key={a.user_id} approval={a} />
            ))}
          </Section>

          <Section
            title={`Denied (${deniedAccounts.length})`}
            empty="None."
          >
            {deniedAccounts.map((a) => (
              <ApprovalRow key={a.user_id} approval={a} />
            ))}
          </Section>
        </div>

        <div className="space-y-4">
          <div className="border-b border-neutral-200 pb-1 dark:border-neutral-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Password resets
            </h2>
          </div>

          <Section
            title={`Pending (${pendingResets.length})`}
            empty="No requests waiting."
          >
            {pendingResets.map((r) => (
              <ResetRequestRow key={r.id} request={r} />
            ))}
          </Section>

          <Section
            title={`Approved, waiting on user (${waitingResets.length})`}
            empty="None."
          >
            {waitingResets.map((r) => (
              <ResetRequestRow key={r.id} request={r} />
            ))}
          </Section>

          <Section
            title={`Completed (${fulfilledResets.length})`}
            empty="None yet."
          >
            {fulfilledResets.map((r) => (
              <ResetRequestRow key={r.id} request={r} />
            ))}
          </Section>

          {expiredResets.length > 0 && (
            <Section
              title={`Expired (${expiredResets.length})`}
              empty="None."
              hint="Requests over 30 minutes old that were never approved — safe to ignore."
            >
              {expiredResets.map((r) => (
                <ResetRequestRow key={r.id} request={r} expired />
              ))}
            </Section>
          )}
        </div>
      </section>
    </>
  );
}

function Section({
  title,
  empty,
  hint,
  children,
}: {
  title: string;
  empty: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasContent = items.some((c) => c !== null && c !== false);
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </h3>
      {hint && (
        <p className="mb-2 text-[11px] italic text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {hasContent ? (
        <ul className="space-y-2">{children}</ul>
      ) : (
        <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
          {empty}
        </p>
      )}
    </div>
  );
}
