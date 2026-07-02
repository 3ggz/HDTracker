"use client";

import { useEffect } from "react";

// Same blur + defer trick as the job print toolbar — iOS Safari
// refuses a second window.print() while the initiating button still
// holds focus. Optional documentTitle sets the browser tab title so
// "Save as PDF" defaults to a sensible filename.
export function ExportPdfButton({
  documentTitle,
}: {
  documentTitle?: string;
}) {
  useEffect(() => {
    if (!documentTitle) return;
    const prior = document.title;
    document.title = documentTitle.replace(/[\\/:*?"<>|]+/g, "-").trim();
    return () => {
      document.title = prior;
    };
  }, [documentTitle]);

  return (
    <button
      type="button"
      onClick={(e) => {
        (e.currentTarget as HTMLButtonElement).blur();
        setTimeout(() => window.print(), 0);
      }}
      className="flex h-9 items-center gap-1 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white active:scale-95 dark:bg-neutral-100 dark:text-neutral-900 print:hidden"
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
  );
}
