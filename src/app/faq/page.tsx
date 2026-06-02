import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { AddFaqFab } from "@/components/AddFaqFab";
import { LiveUpdater } from "@/components/LiveUpdater";
import { PendingApprovalsBanner } from "@/components/PendingApprovalsBanner";
import { SectionTabs } from "@/components/SectionTabs";
import { isAdminEmail } from "@/lib/admin";
import { publicFaqPhotoUrl } from "@/lib/faq-photos";

export default async function FaqPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

  const [{ data: entries, error }, pendingApprovals, { data: photos }] =
    await Promise.all([
      supabase
        .from("faq_entries")
        .select("id, title, body, updated_at")
        .order("updated_at", { ascending: false }),
      isAdmin
        ? supabase
            .from("user_approvals")
            .select("*", { count: "exact", head: true })
            .is("approved_at", null)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("faq_photos")
        .select("faq_entry_id, storage_path, position")
        .order("position", { ascending: true }),
    ]);

  const pendingCount =
    isAdmin && "count" in pendingApprovals ? (pendingApprovals.count ?? 0) : 0;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const firstPhotoByEntry = new Map<string, string>();
  for (const p of photos ?? []) {
    if (!firstPhotoByEntry.has(p.faq_entry_id)) {
      firstPhotoByEntry.set(p.faq_entry_id, p.storage_path);
    }
  }

  return (
    <>
      <LiveUpdater channelName="faq-list" table="faq_entries" />
      <AppHeader />
      {isAdmin && <PendingApprovalsBanner initialCount={pendingCount} />}
      <SectionTabs active="faq" />
      <section className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load FAQ: {error.message}
          </p>
        ) : !entries || entries.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => {
              const thumb = firstPhotoByEntry.get(e.id);
              return (
                <li key={e.id}>
                  <Link
                    href={`/faq/${e.id}`}
                    className="flex gap-3 rounded-2xl border border-neutral-200 bg-white p-3 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    {thumb ? (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={publicFaqPhotoUrl(supabaseUrl, thumb)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                        <svg
                          className="h-6 w-6 text-neutral-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">
                        {e.title}
                      </p>
                      {e.body && (
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                          {e.body}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <AddFaqFab />
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
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-medium">FAQ is empty</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        Tap + to add a reference entry. Wiring diagrams, install tips, photos
        of tricky configs — anything a less-experienced installer would want
        to look up.
      </p>
    </div>
  );
}
