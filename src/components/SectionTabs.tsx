"use client";

import Link from "next/link";
import { useFaqUnreadCounts } from "@/lib/faq-unread";

type Tab = { href: string; label: string; key: "vehicles" | "jobs" | "faq" };

// Jobs sits in the middle — it's the default page and the one
// people open the app for. Inventory lives at /vehicles now; the
// bare "/" route redirects to /jobs. Keys stay stable so existing
// `active="vehicles"` / `active="jobs"` calls don't churn.
const TABS: readonly Tab[] = [
  { href: "/vehicles", label: "Inventory", key: "vehicles" },
  { href: "/jobs", label: "Jobs", key: "jobs" },
  { href: "/faq", label: "FAQ", key: "faq" },
];

export function SectionTabs({
  active,
}: {
  active: "vehicles" | "jobs" | "faq";
}) {
  // FAQ tab badges total unread across both sub-categories. Hook is
  // safe pre-mount (returns zeroes), so SSR doesn't blow up.
  const { total: faqUnread } = useFaqUnreadCounts();

  return (
    <nav aria-label="Sections" className="mx-auto w-full max-w-md px-4 pt-3">
      <div className="flex gap-2 rounded-xl bg-neutral-200/60 p-1 dark:bg-neutral-900">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const unread = tab.key === "faq" ? faqUnread : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "relative flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition " +
                (isActive
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 active:text-neutral-900 dark:text-neutral-400 dark:active:text-neutral-100")
              }
            >
              {tab.label}
              {unread > 0 && (
                <span
                  aria-label={`${unread} new`}
                  className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 align-middle text-[10px] font-semibold tabular-nums text-white"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
