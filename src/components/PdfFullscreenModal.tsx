"use client";

import { useEffect } from "react";
import { PdfPanZoomViewer } from "./PdfPanZoomViewer";

// Lightweight viewer modal so the "fullscreen" button stays inside
// the app. The previous behaviour was an <a href={pdf_url}
// target="_blank"> which iOS Safari handles by replacing the current
// tab with the PDF — leaving the user stranded one back-tap away
// from the site at best, or punted to whatever page they were on
// before the app at worst.
//
// Renders as a fixed overlay with the same pdf.js pan-zoom canvas
// the inline site-map preview uses, in multi-page mode. It used to be
// an <object type="application/pdf"> embed, but WKWebView shows
// embedded PDFs as a static non-interactive first-page preview — no
// zoom, no pan, no page nav — which made this modal dead weight in
// the iOS/Android shells. pdf.js behaves the same on web and in the
// app. Close on:
//   - tap of the X button
//   - tap on the dark backdrop (outside the viewer)
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
      <div
        className="flex-1 overflow-hidden p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <PdfPanZoomViewer pdfUrl={src} multiPage className="h-full w-full" />
      </div>
    </div>
  );
}
