"use client";

import { useEffect } from "react";

// Image counterpart to PdfFullscreenModal — same dismiss-on-backdrop,
// Esc-to-close, no-router-navigation contract. Lives in the app so
// iOS Safari's back button still goes "back to the job page" rather
// than punting the user to whatever tab Safari last had open.
//
// The image is laid out with max-w/h so portraits and landscapes
// both fit on screen without scrolling. Tapping the image itself
// doesn't dismiss — only the surrounding backdrop — so panning a
// zoomed pinch-gesture won't accidentally close.
export function PhotoFullscreenModal({
  src,
  label,
  onClose,
}: {
  src: string;
  label?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
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
      aria-label={label ?? "Photo"}
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur"
      onClick={(e) => {
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
        {label && (
          <p className="flex-1 truncate text-sm font-medium">{label}</p>
        )}
      </header>
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-2"
        onClick={(e) => {
          // Only the outer wrapper closes — clicking through to the
          // backdrop (anywhere outside the <img>) lets the user
          // dismiss without hitting the X. Clicks on the image itself
          // stop here, see below.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label ?? ""}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full select-none object-contain"
        />
      </div>
    </div>
  );
}
