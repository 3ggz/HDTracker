"use client";

import { useState } from "react";
import { PhotoFullscreenModal } from "./PhotoFullscreenModal";

// Thumbnail grid for read-only pages (quickview, share). Tapping a
// thumb opens the in-app fullscreen viewer with pinch-zoom, replacing
// the old <a target="_blank"> that punted iOS users out of the page.
export function PhotoThumbGallery({
  photos,
  label,
}: {
  photos: { id: string; src: string }[];
  label?: string;
}) {
  const [openSrc, setOpenSrc] = useState<string | null>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenSrc(p.src)}
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
      {openSrc && (
        <PhotoFullscreenModal
          src={openSrc}
          label={label}
          onClose={() => setOpenSrc(null)}
        />
      )}
    </>
  );
}
