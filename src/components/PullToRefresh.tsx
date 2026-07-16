"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TRIGGER_PX = 60;
const MAX_PULL_PX = 96;
const MIN_SPIN_MS = 500;

// Touch pull-to-refresh for body-scrolled list pages. The Capacitor
// shells are plain WKWebViews with no native pull-to-refresh, so the
// gesture has to live in the web layer — mobile browsers get the same
// behavior for free, and desktop (no touch events) is unaffected.
// Listeners sit on the document so a pull works from anywhere on the
// page, not just over the wrapped content; drag styling is imperative
// (no re-render per touchmove).
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const armedAt = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);

  function setDrag(dist: number) {
    const content = contentRef.current;
    const ind = indicatorRef.current;
    if (!content || !ind) return;
    const progress = Math.min(1, dist / TRIGGER_PX);
    content.style.transition = "none";
    content.style.transform = `translateY(${dist}px)`;
    ind.style.transition = "none";
    ind.style.opacity = String(progress);
    ind.style.transform = `translate(-50%, ${-40 + dist * 0.9}px)`;
    const arrow = arrowRef.current;
    if (arrow) arrow.style.transform = `rotate(${progress * 180}deg)`;
  }

  function settle(target: "rest" | "armed") {
    const content = contentRef.current;
    const ind = indicatorRef.current;
    if (!content || !ind) return;
    content.style.transition = "transform 200ms ease";
    ind.style.transition = "transform 200ms ease, opacity 200ms ease";
    if (target === "armed") {
      content.style.transform = `translateY(${TRIGGER_PX}px)`;
      ind.style.opacity = "1";
      ind.style.transform = "translate(-50%, 14px)";
    } else {
      content.style.transform = "";
      ind.style.opacity = "0";
      ind.style.transform = "translate(-50%, -40px)";
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
    if (!armed || isPending) return;
    const remain = Math.max(0, MIN_SPIN_MS - (Date.now() - armedAt.current));
    const t = window.setTimeout(() => setArmed(false), remain);
    return () => window.clearTimeout(t);
  }, [armed, isPending]);

  useEffect(() => {
    const g = {
      tracking: false,
      pulling: false,
      startX: 0,
      startY: 0,
      dist: 0,
    };

    function abort() {
      g.tracking = false;
      if (g.pulling) {
        g.pulling = false;
        g.dist = 0;
        settle("rest");
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (armedRef.current || e.touches.length !== 1 || window.scrollY > 0) {
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
    <div className="relative">
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        style={{ transform: "translate(-50%, -40px)", opacity: 0 }}
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
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
