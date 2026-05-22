"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  deleteVehiclePhoto,
  publicPhotoUrl,
  uploadVehiclePhoto,
  type VehiclePhoto,
} from "@/lib/vehicle-photos";

export function PhotoGallery({
  vehicleId,
  issueId = null,
  initialPhotos,
  compact = false,
  addLabel = "Add photo",
}: {
  vehicleId: string;
  issueId?: string | null;
  initialPhotos: VehiclePhoto[];
  compact?: boolean;
  addLabel?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const supabase = createClient();
    const result = await uploadVehiclePhoto({
      supabase,
      file,
      vehicleId,
      issueId,
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPhotos((current) => [result.photo, ...current]);
    router.refresh();
  }

  async function onConfirmDelete(photo: VehiclePhoto) {
    setPendingDeleteId(photo.id);
    setError(null);

    const supabase = createClient();
    const result = await deleteVehiclePhoto(supabase, photo);

    if (!result.ok) {
      setError(result.error);
      setPendingDeleteId(null);
      return;
    }

    setPhotos((current) => current.filter((p) => p.id !== photo.id));
    setPendingDeleteId(null);
    setConfirmDeleteId(null);
    router.refresh();
  }

  const tileClass = compact
    ? "relative aspect-square overflow-hidden rounded-lg border border-neutral-200 w-16 flex-shrink-0 dark:border-neutral-800"
    : "relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800";

  const listClass = compact
    ? "flex gap-2 overflow-x-auto py-1"
    : "grid grid-cols-3 gap-2";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {(photos.length > 0 || !compact) && (
        <ul className={listClass}>
          {photos.map((photo) => {
            const url = publicPhotoUrl(supabaseUrl, photo.storage_path);
            const isConfirming = confirmDeleteId === photo.id;
            const isPending = pendingDeleteId === photo.id;
            return (
              <li key={photo.id} className={tileClass}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full w-full"
                  onClick={(e) => {
                    if (isConfirming) e.preventDefault();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={photo.caption ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>

                {!isConfirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(photo.id)}
                    aria-label="Remove photo"
                    className={`absolute right-1 top-1 flex items-center justify-center rounded-full bg-black/55 text-white transition active:scale-95 ${
                      compact ? "h-6 w-6" : "h-7 w-7"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className={compact ? "h-3 w-3" : "h-4 w-4"}
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 px-2 text-center text-[11px] leading-tight text-white">
                    <span>Remove?</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isPending}
                        className="rounded bg-white/20 px-2 py-0.5"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(photo)}
                        disabled={isPending}
                        className="rounded bg-red-600 px-2 py-0.5 disabled:opacity-60"
                      >
                        {isPending ? "..." : "Yes"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}

          {compact && (
            <li className="w-16 flex-shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Add photo"
                className="flex aspect-square h-full w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white text-2xl text-neutral-500 transition active:scale-95 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
              >
                {uploading ? "…" : "+"}
              </button>
            </li>
          )}
        </ul>
      )}

      {photos.length === 0 && !compact && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No photos yet.
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileSelected}
        className="hidden"
      />

      {!compact && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="block h-11 w-full rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 transition active:scale-[0.98] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          {uploading ? "Uploading..." : `+ ${addLabel}`}
        </button>
      )}
    </div>
  );
}
