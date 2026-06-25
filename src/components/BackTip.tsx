"use client";

import { useEffect, useState } from "react";

// One-time, non-intrusive toast that nudges new users that mobile
// browser swipe-back works in this app too. Triggered the first time
// the user taps any element with aria-label="Back" (the back arrows
// in our page headers). Marked seen in localStorage so it doesn't
// reappear.
//
// Pinned to the top so it's clear of the bottom-right Add-vehicle FAB
// and the sticky save/cancel bars on editor pages. Highest z-index in
// the app (z-[60]) so nothing covers it.
const STORAGE_KEY = "hdtracker_back_tip_seen";
const VISIBLE_MS = 5000;
const EXIT_MS = 300;

export function BackTip() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return;
    }
    if (alreadySeen) return;

    let stayTimer: ReturnType<typeof setTimeout> | undefined;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const back = target.closest('[aria-label="Back"]');
      if (!back) return;
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      setVisible(true);
      setExiting(false);
      if (stayTimer) clearTimeout(stayTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
      stayTimer = setTimeout(() => {
        setExiting(true);
        unmountTimer = setTimeout(() => setVisible(false), EXIT_MS);
      }, VISIBLE_MS);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (stayTimer) clearTimeout(stayTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        animation: exiting
          ? `hdt-tip-in ${EXIT_MS}ms ease-out reverse forwards`
          : `hdt-tip-in 300ms ease-out both`,
      }}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-2xl ring-1 ring-white/10 dark:bg-neutral-100 dark:text-neutral-900 dark:ring-black/10">
        <SwipeHintIcon />
        <span>Swipe from the left edge to go back.</span>
      </div>
    </div>
  );
}

function SwipeHintIcon() {
  return (
    <div
      aria-hidden="true"
      className="relative h-5 w-10 flex-shrink-0 overflow-hidden"
    >
      {/* The "page edge" line on the left so the dot's motion reads as
          "drag from the edge inward". */}
      <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-current opacity-60" />
      {/* Animated dot that slides from the edge to the right, loops. */}
      <span
        className="absolute left-0 top-1/2 block h-2.5 w-2.5 rounded-full bg-current"
        style={{
          animation: "hdt-swipe-hint 1.8s ease-in-out infinite",
        }}
      />
      {/* Subtle arrow at the right hinting "this direction". */}
      <svg
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60"
      >
        <path d="M3 6h6m-2-3 3 3-3 3" />
      </svg>
    </div>
  );
}
