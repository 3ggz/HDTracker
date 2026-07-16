"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TRIGGER_PX = 64;
const MAX_PULL_PX = 100;
const MIN_SPIN_MS = 500;

export const PULL_REFRESH_EVENT = "hd:pull-refresh";

export type PullRefreshDetail = {
  waitUntil: (p: Promise<unknown>) => void;
};

// Document-wide touch pull-to-refresh, mounted once around the root
// layout's children. The Capacitor shells are plain WKWebViews with no
// native pull-to-refresh, so the gesture lives in the web layer —
// mobile browsers get it for free and desktop (no touch events) is
// unaffected.
//
// A pull fires router.refresh(), which re-renders the current page's
// server components. Pages that hold client state (the job editor)
// listen for PULL_REFRESH_EVENT and register their own refetch via
// detail.waitUntil(promise); the spinner stays up until every
// registered promise settles.
//
// Only the indicator moves — content never translates — so sticky
// headers and fixed bottom bars behave on every page. The gesture is
// skipped when it starts on a textarea (inner scroll), a
// role="dialog" overlay, a dnd-kit sortable (aria-roledescription),
// or anything marked data-ptr-exempt (the PDF canvases and the map
// editor own their touches).
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const armedRef = useRef(false);
  const armedAt = useRef(0);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);

  function setDrag(dist: number) {
    const ind = indicatorRef.current;
    if (!ind) return;
    const progress = Math.min(1, dist / TRIGGER_PX);
    ind.style.transition = "none";
    ind.style.opacity = String(progress);
    ind.style.transform = `translate(-50%, ${-44 + dist}px)`;
    const arrow = arrowRef.current;
    if (arrow) arrow.style.transform = `rotate(${progress * 180}deg)`;
  }

  function settle(target: "rest" | "armed") {
    const ind = indicatorRef.current;
    if (!ind) return;
    ind.style.transition = "transform 200ms ease, opacity 200ms ease";
    if (target === "armed") {
      ind.style.opacity = "1";
      ind.style.transform = `translate(-50%, ${TRIGGER_PX - 44}px)`;
    } else {
      ind.style.opacity = "0";
      ind.style.transform = "translate(-50%, -44px)";
      const arrow = arrowRef.current;
      if (arrow) arrow.style.transform = "";
    }
  }

  useEffect(() => {
    armedRef.current = armed;
    settle(armed ? "armed" : "rest");
  }, [armed]);

  // Keep the spinner visible for a minimum beat even when the refresh
  // resolves instantly, so the gesture never feels like it misfired.
  useEffect(() => {
    if (!armed || isPending || waiting) return;
    const remain = Math.max(0, MIN_SPIN_MS - (Date.now() - armedAt.current));
    const t = window.setTimeout(() => setArmed(false), remain);
    return () => window.clearTimeout(t);
  }, [armed, isPending, waiting]);

  useEffect(() => {
    const g = {
      tracking: false,
      pulling: false,
      startX: 0,
      startY: 0,
      dist: 0,
    };
    const exempt = (t: EventTarget | null) =>
      t instanceof Element &&
      t.closest(
        'textarea, [data-ptr-exempt], [aria-roledescription], [role="dialog"]',
      ) !== null;

    function abort() {
      g.tracking = false;
      if (g.pulling) {
        g.pulling = false;
        g.dist = 0;
        settle("rest");
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (
        armedRef.current ||
        e.touches.length !== 1 ||
        window.scrollY > 0 ||
        exempt(e.target)
      ) {
        g.tracking = false;
        return;
      }
      g.tracking = true;
      g.pulling = false;
      g.dist = 0;
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (!g.tracking || armedRef.current) return;
      if (e.touches.length !== 1) {
        abort();
        return;
      }
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (!g.pulling) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          g.tracking = false;
          return;
        }
        if (dy <= 8 || window.scrollY > 0) return;
        g.pulling = true;
      }
      if (dy <= 0) {
        abort();
        return;
      }
      e.preventDefault();
      g.dist = Math.min(MAX_PULL_PX, dy * 0.5);
      setDrag(g.dist);
    }

    function onTouchEnd() {
      if (!g.pulling) {
        g.tracking = false;
        return;
      }
      const dist = g.dist;
      g.tracking = false;
      g.pulling = false;
      g.dist = 0;
      if (dist >= TRIGGER_PX) {
        armedAt.current = Date.now();
        setArmed(true);
        const waits: Promise<unknown>[] = [];
        window.dispatchEvent(
          new CustomEvent<PullRefreshDetail>(PULL_REFRESH_EVENT, {
            detail: { waitUntil: (p) => waits.push(p) },
          }),
        );
        if (waits.length > 0) {
          setWaiting(true);
          void Promise.allSettled(waits).then(() => setWaiting(false));
        }
        startTransition(() => router.refresh());
      } else {
        settle("rest");
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", abort);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", abort);
    };
  }, [router]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        style={{ transform: "translate(-50%, -44px)", opacity: 0 }}
      >
        {armed ? (
          <svg
            className="h-4 w-4 animate-spin text-neutral-600 dark:text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
        ) : (
          <svg
            ref={arrowRef}
            className="h-4 w-4 text-neutral-600 dark:text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        )}
      </div>
      {children}
    </div>
  );
}
