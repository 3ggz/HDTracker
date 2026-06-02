"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FaqEntry, FaqPhoto } from "@/lib/faq";
import {
  deleteFaqPhoto,
  publicFaqPhotoUrl,
  uploadFaqPhoto,
} from "@/lib/faq-photos";

const inputClass =
  "block h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

const textareaClass =
  "block min-h-[160px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

export function FaqDetailClient({
  initialEntry,
  initialPhotos,
  photosLoadError,
}: {
  initialEntry: FaqEntry;
  initialPhotos: FaqPhoto[];
  photosLoadError: string | null;
}) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [entry, setEntry] = useState(initialEntry);
  const [photos, setPhotos] = useState(initialPhotos);

  const [titleDraft, setTitleDraft] = useState(initialEntry.title);
  const [bodyDraft, setBodyDraft] = useState(initialEntry.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);

  const dirty =
    titleDraft.trim() !== entry.title ||
    (bodyDraft.trim() || null) !== entry.body;

  async function save() {
    const t = titleDraft.trim();
    if (!t) {
      setError("Title can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("faq_entries")
      .update({ title: t, body: bodyDraft.trim() || null })
      .eq("id", entry.id)
      .select("*")
      .single();
    setSaving(false);
    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't save.");
      return;
    }
    setEntry(data as FaqEntry);
    setTitleDraft((data as FaqEntry).title);
    setBodyDraft((data as FaqEntry).body ?? "");
    router.refresh();
  }

  async function deleteEntry() {
    setDeletingEntry(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("faq_entries")
      .delete()
      .eq("id", entry.id)
      .select("id");
    setDeletingEntry(false);
    if (dbError) {
      alert(dbError.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("No rows affected. Try signing out and back in.");
      return;
    }
    router.push("/faq");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-32 pt-4">
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Title
          </span>
          <input
            className={inputClass}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Body
          </span>
          <textarea
            className={textareaClass}
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="Reference text..."
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="h-12 flex-1 rounded-lg bg-neutral-900 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {dirty && !saving && (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(entry.title);
                setBodyDraft(entry.body ?? "");
                setError(null);
              }}
              className="h-12 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Discard
            </button>
          )}
        </div>
      </section>

      <PhotosSection
        entryId={entry.id}
        photos={photos}
        supabaseUrl={supabaseUrl}
        loadError={photosLoadError}
        onAdded={(p) => setPhotos((current) => [...current, p])}
        onUpdated={(p) =>
          setPhotos((current) =>
            current.map((x) => (x.id === p.id ? p : x)),
          )
        }
        onDeleted={(id) =>
          setPhotos((current) => current.filter((p) => p.id !== id))
        }
      />

      <section className="pt-2">
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={deleteEntry}
              disabled={deletingEntry}
              className="h-12 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deletingEntry ? "Deleting..." : "Confirm delete entry"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deletingEntry}
              className="h-12 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="h-12 w-full rounded-lg border border-red-300 text-sm font-medium text-red-600 transition active:bg-red-50 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
          >
            Delete entry
          </button>
        )}
      </section>
    </main>
  );
}

function PhotosSection({
  entryId,
  photos,
  supabaseUrl,
  loadError,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  entryId: string;
  photos: FaqPhoto[];
  supabaseUrl: string;
  loadError: string | null;
  onAdded: (p: FaqPhoto) => void;
  onUpdated: (p: FaqPhoto) => void;
  onDeleted: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const result = await uploadFaqPhoto({
      supabase,
      file,
      faqEntryId: entryId,
    });
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdded(result.photo);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Photos ({photos.length})
      </h2>
      {loadError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          Couldn&apos;t load photos: {loadError}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="space-y-3">
          {photos.map((p) => (
            <PhotoRow
              key={p.id}
              photo={p}
              supabaseUrl={supabaseUrl}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </ul>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="h-12 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
      >
        {uploading ? "Uploading..." : "+ Add photo"}
      </button>
    </section>
  );
}

function PhotoRow({
  photo,
  supabaseUrl,
  onUpdated,
  onDeleted,
}: {
  photo: FaqPhoto;
  supabaseUrl: string;
  onUpdated: (p: FaqPhoto) => void;
  onDeleted: (id: string) => void;
}) {
  const [captionDraft, setCaptionDraft] = useState(photo.caption ?? "");
  const [syncedCaption, setSyncedCaption] = useState(photo.caption ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if ((photo.caption ?? "") !== syncedCaption) {
    setSyncedCaption(photo.caption ?? "");
    if (captionDraft === syncedCaption) {
      setCaptionDraft(photo.caption ?? "");
    }
  }

  async function saveCaption() {
    const next = captionDraft.trim() || null;
    if (next === photo.caption) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faq_photos")
      .update({ caption: next })
      .eq("id", photo.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't save caption.");
      return;
    }
    onUpdated(data as FaqPhoto);
  }

  async function remove() {
    setDeleting(true);
    const supabase = createClient();
    const result = await deleteFaqPhoto(supabase, photo);
    setDeleting(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    onDeleted(photo.id);
  }

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <a
        href={publicFaqPhotoUrl(supabaseUrl, photo.storage_path)}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicFaqPhotoUrl(supabaseUrl, photo.storage_path)}
          alt={photo.caption ?? ""}
          className="max-h-[60vh] w-full object-contain"
        />
      </a>
      <div className="space-y-2 p-3">
        <input
          type="text"
          placeholder="Caption (optional)"
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          onBlur={saveCaption}
          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="h-9 flex-1 rounded-md bg-red-600 text-xs font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "..." : "Delete photo"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="h-9 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 dark:border-red-900 dark:text-red-400"
          >
            Delete photo
          </button>
        )}
      </div>
    </li>
  );
}
