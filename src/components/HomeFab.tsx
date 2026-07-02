"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Universal home button. Sits bottom-left so it doesn't fight the
// existing bottom-right + FABs (AddVehicle / AddJob) or the bottom-
// center save-status pill on the job editor. Hidden on the home
// page itself (now /jobs) and on auth screens where "home" isn't
// meaningful. /, /signin, and /pending-approval stay in the
// hide-list as a belt-and-suspenders for any in-flight redirects.
const HIDE_EXACT = new Set([
  "/",
  "/jobs",
  "/signin",
  "/pending-approval",
]);
const HIDE_PREFIX = ["/forgot-password", "/share"];

export function HomeFab() {
  const pathname = usePathname();
  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIX.some((p) => pathname.startsWith(p))) return null;
  return (
    <Link
      href="/jobs"
      aria-label="Home"
      className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-lg backdrop-blur active:scale-95 dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-200 print:hidden"
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V10" />
      </svg>
    </Link>
  );
}
