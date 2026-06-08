"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  name: string;
  number: string | null;
  address: string | null;
  completed_at: string | null;
};

export function JobsListClient({ jobs }: { jobs: Job[] }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  // Client-side filter on name + number + address. Fast for the hundreds-
  // of-jobs scale we're at; promote to a server param if the list ever
  // gets unwieldy.
  const filtered = useMemo(() => {
    if (!trimmed) return jobs;
    return jobs.filter((j) => {
      const haystack = [j.name, j.number ?? "", j.address ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [jobs, trimmed]);

  const open = filtered.filter((j) => !j.completed_at);
  const completed = filtered.filter((j) => j.completed_at);

  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <SearchBar value={query} onChange={setQuery} />
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No jobs match &ldquo;{trimmed}&rdquo;.
        </p>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="space-y-3">
              {open.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </ul>
          )}
          {open.length === 0 && completed.length > 0 && (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              No open jobs match. Everything below is done.
            </p>
          )}
          {completed.length > 0 && (
            <div className="mt-8 border-t-2 border-emerald-500 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Completed jobs ({completed.length})
              </h2>
              <ul className="space-y-3">
                {completed.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
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
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or job #"
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-9 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <svg
            className="h-4 w-4"
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
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <li>
      <Link
        href={`/jobs/${job.id}`}
        className="relative block rounded-2xl border border-neutral-200 bg-white px-4 py-4 pb-7 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p className="text-base font-medium">{job.name}</p>
        {job.number && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            #{job.number}
          </p>
        )}
        {job.address && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {job.address}
          </p>
        )}
        {job.completed_at && (
          <span
            className="absolute bottom-2 right-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
            title={`Completed ${new Date(job.completed_at).toLocaleString()}`}
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed
          </span>
        )}
      </Link>
    </li>
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
