"use client";

import { useState } from "react";
import { PhotoFullscreenModal } from "./PhotoFullscreenModal";

// Thumbnail grid for read-only pages (quickview, share). Tapping a
// thumb opens the in-app fullscreen viewer with pinch-zoom, replacing
// the old <a target="_blank"> that punted iOS users out of the page.
// A photo's own label (e.g. "D3 — 5500 Exciter") wins over the group
// label in the fullscreen header. The grid carries a stable
// .photo-thumb-grid class so print stylesheets can re-column it.
export function PhotoThumbGallery({
  photos,
  label,
}: {
  photos: { id: string; src: string; label?: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState<{ src: string; label?: string } | null>(
    null,
  );
  return (
    <>
      <div className="photo-thumb-grid grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen({ src: p.src, label: p.label })}
            className="block aspect-square overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={p.src}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {open && (
        <PhotoFullscreenModal
          src={open.src}
          label={open.label ?? label}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
