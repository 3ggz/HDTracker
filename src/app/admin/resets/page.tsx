import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetRequestRow } from "@/components/ResetRequestRow";
import { LiveUpdater } from "@/components/LiveUpdater";
import { isAdminEmail } from "@/lib/admin";

export default async function PasswordResetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) notFound();

  const { data: requests, error } = await supabase
    .from("password_reset_requests")
    .select("id, email, requested_at, approved_at, fulfilled_at")
    .order("requested_at", { ascending: false })
    .limit(50);

  const rows = requests ?? [];
  const pending = rows.filter((r) => !r.approved_at);
  const waiting = rows.filter((r) => r.approved_at && !r.fulfilled_at);
  const fulfilled = rows.filter((r) => r.fulfilled_at);

  return (
    <>
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
        <h1 className="text-base font-semibold tracking-tight">
          Password resets
        </h1>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load reset requests: {error.message}
          </p>
        )}

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Pending ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              No requests waiting.
            </p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <ResetRequestRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Approved, waiting on user ({waiting.length})
          </h2>
          {waiting.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              None.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((r) => (
                <ResetRequestRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Completed ({fulfilled.length})
          </h2>
          {fulfilled.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              None yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {fulfilled.map((r) => (
                <ResetRequestRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
