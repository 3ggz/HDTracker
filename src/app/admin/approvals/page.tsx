import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApprovalRow } from "@/components/ApprovalRow";
import { LiveUpdater } from "@/components/LiveUpdater";
import { isAdminEmail } from "@/lib/admin";

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) notFound();

  const { data: approvals, error } = await supabase
    .from("user_approvals")
    .select("user_id, email, approved_at, created_at")
    .order("created_at", { ascending: false });

  const rows = approvals ?? [];
  const pending = rows.filter((a) => !a.approved_at);
  const approved = rows.filter((a) => a.approved_at);

  return (
    <>
      <LiveUpdater channelName="admin-approvals" table="user_approvals" />
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
        <h1 className="text-base font-semibold tracking-tight">
          Account approvals
        </h1>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load approvals: {error.message}
          </p>
        )}

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Pending ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              No accounts waiting.
            </p>
          ) : (
            <ul className="space-y-2">
              {pending.map((a) => (
                <ApprovalRow key={a.user_id} approval={a} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Approved ({approved.length})
          </h2>
          {approved.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              None yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {approved.map((a) => (
                <ApprovalRow key={a.user_id} approval={a} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
