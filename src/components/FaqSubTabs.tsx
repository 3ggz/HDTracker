"use client";

import Link from "next/link";
import { useFaqUnreadCounts } from "@/lib/faq-unread";

type Sub = { href: string; label: string; key: "articles" | "qa" };

const TABS: readonly Sub[] = [
  { href: "/faq", label: "Articles", key: "articles" },
  { href: "/faq/q", label: "Q&A", key: "qa" },
];

export function FaqSubTabs({ active }: { active: "articles" | "qa" }) {
  const { articles, qa } = useFaqUnreadCounts();
  const countFor = (key: "articles" | "qa") =>
    key === "articles" ? articles : qa;

  return (
    <nav
      aria-label="FAQ section"
      className="mx-auto w-full max-w-md px-4 pt-2"
    >
      <div className="flex gap-1 rounded-lg bg-neutral-200/60 p-1 dark:bg-neutral-900">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const unread = countFor(tab.key);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-center text-xs font-medium transition " +
                (isActive
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 active:text-neutral-900 dark:text-neutral-400 dark:active:text-neutral-100")
              }
            >
              {tab.label}
              {unread > 0 && (
                <span
                  aria-label={`${unread} new`}
                  className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold tabular-nums text-white"
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
