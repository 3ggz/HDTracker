"use client";

import { useEffect } from "react";

// Lightweight viewer modal so the "fullscreen" button stays inside
// the app. The previous behaviour was an <a href={pdf_url}
// target="_blank"> which iOS Safari handles by replacing the current
// tab with the PDF — leaving the user stranded one back-tap away
// from the site at best, or punted to whatever page they were on
// before the app at worst.
//
// Renders as a fixed overlay with the same PDF <object> embed the
// site map section uses, plus a big close button. Close on:
//   - tap of the X button
//   - tap on the dark backdrop (outside the white card)
//   - Esc key (desktop)
// No router navigation either way, so back button / back swipe
// behave normally relative to the underlying job page.
export function PdfFullscreenModal({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the modal is up so the underlying job
    // page doesn't snap-scroll when the user pans the PDF.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={`${label} — fullscreen`}
      className="fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur"
      onClick={(e) => {
        // Treat backdrop taps as close — anything inside the inner
        // container stops propagation so the embed still works.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex items-center gap-3 border-b border-white/10 bg-neutral-900/95 px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10"
        >
          <svg
            className="h-5 w-5"
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
        <p className="flex-1 truncate text-sm font-medium">{label}</p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center rounded-md border border-white/20 px-2 text-xs font-medium text-white/90 active:bg-white/10"
        >
          Open externally
        </a>
      </header>
      <div className="flex-1 overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
        <object
          data={src + "#view=FitH"}
          type="application/pdf"
          className="block h-full w-full rounded-lg bg-white"
          aria-label={label}
        >
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full w-full items-center justify-center bg-white p-6 text-center text-sm text-neutral-600"
          >
            Your browser can&apos;t render PDFs inline. Tap to open the
            file directly.
          </a>
        </object>
      </div>
    </div>
  );
}
