"use client";

import { useEffect, useRef, useState } from "react";
import { requestPrint } from "@/lib/print";

// Same blur + defer trick as the job print toolbar — iOS Safari
// refuses a second window.print() while the initiating button still
// holds focus. Optional documentTitle sets the browser tab title so
// "Save as PDF" defaults to a sensible filename.
export function ExportPdfButton({
  documentTitle,
}: {
  documentTitle?: string;
}) {
  const [blocked, setBlocked] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!documentTitle) return;
    const prior = document.title;
    document.title = documentTitle.replace(/[\\/:*?"<>|]+/g, "-").trim();
    return () => {
      document.title = prior;
    };
  }, [documentTitle]);

  useEffect(() => () => stopRef.current?.(), []);

  return (
    <div className="relative print:hidden">
      <button
        type="button"
        onClick={(e) => {
          (e.currentTarget as HTMLButtonElement).blur();
          setBlocked(false);
          stopRef.current?.();
          stopRef.current = requestPrint(window, (outcome) => {
            stopRef.current = null;
            if (outcome === "blocked") setBlocked(true);
          });
        }}
        className="flex h-9 items-center gap-1 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white active:scale-95 dark:bg-neutral-100 dark:text-neutral-900"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9 15 12 18 15 15" />
        </svg>
        Export PDF
      </button>
      {blocked && (
        <p className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900 shadow-lg dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200">
          Couldn&apos;t open a print dialog here. If you&apos;re in the
          HD Security app, open this page in Safari / Chrome to export
          the PDF.
        </p>
      )}
    </div>
  );
}
