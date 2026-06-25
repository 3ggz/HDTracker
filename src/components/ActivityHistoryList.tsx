"use client";

import { useMemo, useState } from "react";
import {
  formatRelativeTime,
  groupActivitiesByDay,
} from "@/lib/vehicle-activity";

// Generic "activity entry" shape so this list works for both job and
// vehicle history without dragging in either domain's specific
// schema. The server pages pre-compute description + actor strings
// from their respective domain libs before passing entries in.
export type ActivityEntry = {
  id: string;
  created_at: string;
  actor: string;
  description: string;
};

export function ActivityHistoryList({
  entries,
  emptyMessage,
}: {
  entries: ActivityEntry[];
  emptyMessage: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const groups = useMemo(() => groupActivitiesByDay(filtered), [filtered]);

  return (
    <>
      <div className="relative mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search history…"
          enterKeyHint="search"
          aria-label="Search history"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="block h-10 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-9 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {emptyMessage}
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No matches for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {group.label}
            </h2>
            <ul className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              {group.activities.map((activity, i) => (
                <li
                  key={activity.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    i > 0
                      ? "border-t border-neutral-200 dark:border-neutral-800"
                      : ""
                  }`}
                >
                  <div className="w-16 flex-shrink-0 leading-tight">
                    <time
                      dateTime={activity.created_at}
                      className="block text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                    >
                      {formatRelativeTime(activity.created_at)}
                    </time>
                    <span className="mt-0.5 block text-[10px] text-neutral-400 dark:text-neutral-500">
                      {activity.actor}
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 text-sm text-neutral-800 dark:text-neutral-200">
                    {activity.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );
}
