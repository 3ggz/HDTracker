"use client";

import { useEffect, useState } from "react";

// A one-time, non-intrusive toast that nudges new users that mobile
// browser swipe-back works in this app too. Triggered the first time
// the user taps any element with aria-label="Back" (the back arrows
// in our page headers). Marked seen in localStorage so it doesn't
// reappear.
const STORAGE_KEY = "hdtracker_back_tip_seen";
const VISIBLE_MS = 4000;

export function BackTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage can be unavailable in some contexts — be conservative
      // and skip the tip entirely if we can't track that we've shown it.
      return;
    }
    if (alreadySeen) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

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
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="rounded-full bg-neutral-900 px-4 py-2 text-center text-xs font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
        Tip: swipe from the left edge of the screen to go back too.
      </div>
    </div>
  );
}
