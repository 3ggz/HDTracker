"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Job, JobDoor, JobDoorItem } from "@/lib/jobs";
import {
  deleteJobPhoto,
  deleteSiteMap,
  publicJobFileUrl,
  uploadDoorItemPhoto,
  uploadJobPhoto,
  uploadSiteMap,
  type JobPhoto,
} from "@/lib/job-photos";
import { HUGS_TEMPLATE } from "@/lib/job-templates";

const inputClass =
  "block h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

const textareaClass =
  "block min-h-[88px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

export function JobDetailClient({
  initialJob,
  initialDoors,
  initialItems,
  initialPhotos,
  doorsLoadError,
  itemsLoadError,
  photosLoadError,
}: {
  initialJob: Job;
  initialDoors: JobDoor[];
  initialItems: JobDoorItem[];
  initialPhotos: JobPhoto[];
  doorsLoadError: string | null;
  itemsLoadError: string | null;
  photosLoadError: string | null;
}) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const [job, setJob] = useState(initialJob);
  const [doors, setDoors] = useState(initialDoors);
  const [items, setItems] = useState(initialItems);
  const [photos, setPhotos] = useState(initialPhotos);

  const [headerDraft, setHeaderDraft] = useState({
    name: initialJob.name,
    number: initialJob.number ?? "",
    address: initialJob.address ?? "",
    notes: initialJob.notes ?? "",
  });
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const headerDirty =
    headerDraft.name !== job.name ||
    (headerDraft.number || null) !== job.number ||
    (headerDraft.address || null) !== job.address ||
    (headerDraft.notes || null) !== job.notes;

  async function saveHeader() {
    const trimmedName = headerDraft.name.trim();
    if (!trimmedName) {
      setHeaderError("Job needs a name.");
      return;
    }
    setHeaderSaving(true);
    setHeaderError(null);
    const supabase = createClient();
    const patch = {
      name: trimmedName,
      number: headerDraft.number.trim() || null,
      address: headerDraft.address.trim() || null,
      notes: headerDraft.notes.trim() || null,
    };
    const { data, error } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .select("*")
      .single();
    setHeaderSaving(false);
    if (error || !data) {
      setHeaderError(error?.message ?? "Couldn't save.");
      return;
    }
    setJob(data as Job);
    setHeaderDraft({
      name: data.name,
      number: data.number ?? "",
      address: data.address ?? "",
      notes: data.notes ?? "",
    });
    router.refresh();
  }

  const itemsByDoor = useMemo(() => {
    const map = new Map<string, JobDoorItem[]>();
    for (const it of items) {
      const list = map.get(it.door_id) ?? [];
      list.push(it);
      map.set(it.door_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [items]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 pb-32 pt-4">
      <Section title="Job details">
        <Field label="Name">
          <input
            className={inputClass}
            value={headerDraft.name}
            onChange={(e) =>
              setHeaderDraft((d) => ({ ...d, name: e.target.value }))
            }
          />
        </Field>
        <Field label="Job number" hint="Optional">
          <input
            className={inputClass}
            value={headerDraft.number}
            onChange={(e) =>
              setHeaderDraft((d) => ({ ...d, number: e.target.value }))
            }
          />
        </Field>
        <Field label="Address" hint="Optional">
          <input
            className={inputClass}
            value={headerDraft.address}
            onChange={(e) =>
              setHeaderDraft((d) => ({ ...d, address: e.target.value }))
            }
          />
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea
            className={textareaClass}
            value={headerDraft.notes}
            onChange={(e) =>
              setHeaderDraft((d) => ({ ...d, notes: e.target.value }))
            }
          />
        </Field>
        {headerError && <ErrorBanner message={headerError} />}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!headerDirty || headerSaving}
            onClick={saveHeader}
            className="h-12 flex-1 rounded-lg bg-neutral-900 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {headerSaving ? "Saving..." : "Save details"}
          </button>
          {headerDirty && !headerSaving && (
            <button
              type="button"
              onClick={() =>
                setHeaderDraft({
                  name: job.name,
                  number: job.number ?? "",
                  address: job.address ?? "",
                  notes: job.notes ?? "",
                })
              }
              className="h-12 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
            >
              Discard
            </button>
          )}
        </div>
      </Section>

      <SiteMapSection
        job={job}
        onJobUpdate={(j) => setJob(j)}
        supabaseUrl={supabaseUrl}
      />

      <Section
        title={`Doors (${doors.length})`}
        action={
          <AddDoorMenu
            jobId={job.id}
            existingCount={doors.length}
            onAdded={(door, newItems) => {
              setDoors((d) => [...d, door]);
              if (newItems.length) setItems((i) => [...i, ...newItems]);
            }}
          />
        }
      >
        {doorsLoadError && (
          <ErrorBanner message={`Doors load error: ${doorsLoadError}`} />
        )}
        {itemsLoadError && (
          <ErrorBanner message={`Items load error: ${itemsLoadError}`} />
        )}
        {doors.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No doors yet. Tap{" "}
            <span className="font-medium">+ Door</span> to add one.
          </p>
        ) : (
          <ul className="space-y-3">
            {doors.map((door) => (
              <DoorCard
                key={door.id}
                job={job}
                door={door}
                items={itemsByDoor.get(door.id) ?? []}
                supabaseUrl={supabaseUrl}
                jobPhotos={photos.filter((p) => p.door_id === door.id)}
                onDoorUpdate={(updated) =>
                  setDoors((current) =>
                    current.map((d) => (d.id === updated.id ? updated : d)),
                  )
                }
                onDoorDelete={(id) => {
                  setDoors((current) => current.filter((d) => d.id !== id));
                  setItems((current) =>
                    current.filter((it) => it.door_id !== id),
                  );
                  setPhotos((current) =>
                    current.filter((p) => p.door_id !== id),
                  );
                }}
                onItemsChange={(doorId, next) => {
                  setItems((current) => [
                    ...current.filter((it) => it.door_id !== doorId),
                    ...next,
                  ]);
                }}
                onPhotoAdded={(photo) =>
                  setPhotos((current) => [photo, ...current])
                }
                onPhotoDeleted={(id) =>
                  setPhotos((current) => current.filter((p) => p.id !== id))
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Job photos (${photos.filter((p) => !p.door_id).length})`}>
        {photosLoadError && (
          <ErrorBanner message={`Photos load error: ${photosLoadError}`} />
        )}
        <JobPhotoSection
          jobId={job.id}
          doorId={null}
          photos={photos.filter((p) => !p.door_id)}
          supabaseUrl={supabaseUrl}
          onAdded={(photo) => setPhotos((current) => [photo, ...current])}
          onDeleted={(id) =>
            setPhotos((current) => current.filter((p) => p.id !== id))
          }
        />
      </Section>

      <DeleteJobSection jobId={job.id} jobName={job.name} />
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium">
        <span>{label}</span>
        {hint && (
          <span className="font-normal text-neutral-400 dark:text-neutral-500">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
    >
      {message}
    </p>
  );
}

function AddDoorMenu({
  jobId,
  existingCount,
  onAdded,
}: {
  jobId: string;
  existingCount: number;
  onAdded: (door: JobDoor, items: JobDoorItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function addDoor(template: "blank" | "hugs") {
    setPending(true);
    setOpen(false);
    const supabase = createClient();
    const position = existingCount;
    const defaultName =
      template === "hugs"
        ? `Door ${existingCount + 1} (HUGS)`
        : `Door ${existingCount + 1}`;

    const { data: door, error } = await supabase
      .from("job_doors")
      .insert({ job_id: jobId, name: defaultName, position })
      .select("*")
      .single();

    if (error || !door) {
      setPending(false);
      alert(error?.message ?? "Couldn't add door.");
      return;
    }

    let newItems: JobDoorItem[] = [];
    if (template === "hugs") {
      const itemRows = HUGS_TEMPLATE.requiredItems.map((name, idx) => ({
        door_id: door.id,
        name,
        position: idx,
      }));
      const { data: insertedItems, error: itemsError } = await supabase
        .from("job_door_items")
        .insert(itemRows)
        .select("*");
      if (itemsError) {
        alert(`Door added, but items failed: ${itemsError.message}`);
      } else if (insertedItems) {
        newItems = insertedItems as JobDoorItem[];
      }
    }

    setPending(false);
    onAdded(door as JobDoor, newItems);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="h-9 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white transition active:scale-95 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Adding..." : "+ Door"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => addDoor("hugs")}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            HUGS template
            <span className="block text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
              5500 Exciter, Strobe, HUGS 8 board
            </span>
          </button>
          <button
            type="button"
            onClick={() => addDoor("blank")}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            Blank door
          </button>
        </div>
      )}
    </div>
  );
}

function DoorCard({
  job,
  door,
  items,
  supabaseUrl,
  jobPhotos,
  onDoorUpdate,
  onDoorDelete,
  onItemsChange,
  onPhotoAdded,
  onPhotoDeleted,
}: {
  job: Job;
  door: JobDoor;
  items: JobDoorItem[];
  supabaseUrl: string;
  jobPhotos: JobPhoto[];
  onDoorUpdate: (door: JobDoor) => void;
  onDoorDelete: (id: string) => void;
  onItemsChange: (doorId: string, next: JobDoorItem[]) => void;
  onPhotoAdded: (photo: JobPhoto) => void;
  onPhotoDeleted: (id: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(door.name);
  const [notesDraft, setNotesDraft] = useState(door.notes ?? "");
  const [syncedName, setSyncedName] = useState(door.name);
  const [syncedNotes, setSyncedNotes] = useState(door.notes ?? "");

  if (door.name !== syncedName) {
    setSyncedName(door.name);
    setNameDraft(door.name);
  }
  if ((door.notes ?? "") !== syncedNotes) {
    setSyncedNotes(door.notes ?? "");
    setNotesDraft(door.notes ?? "");
  }

  async function commitField(patch: Partial<JobDoor>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_doors")
      .update(patch)
      .eq("id", door.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't save door.");
      return;
    }
    onDoorUpdate(data as JobDoor);
  }

  async function deleteDoor() {
    if (!confirm(`Delete "${door.name}" and everything on it?`)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("job_doors")
      .delete()
      .eq("id", door.id);
    if (error) {
      alert(error.message);
      return;
    }
    onDoorDelete(door.id);
  }

  async function addItem(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const supabase = createClient();
    const position = items.length;
    const { data, error } = await supabase
      .from("job_door_items")
      .insert({ door_id: door.id, name: trimmed, position })
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't add item.");
      return;
    }
    onItemsChange(door.id, [...items, data as JobDoorItem]);
  }

  async function removeItem(id: string) {
    if (!confirm("Remove this item?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("job_door_items")
      .delete()
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    onItemsChange(
      door.id,
      items.filter((it) => it.id !== id),
    );
  }

  const usedNames = new Set(items.map((it) => it.name));
  const quickAdds = [
    ...HUGS_TEMPLATE.requiredItems,
    ...HUGS_TEMPLATE.optionalItems,
  ].filter((n) => !usedNames.has(n));

  return (
    <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-2">
        <input
          className={inputClass + " flex-1"}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== door.name) {
              commitField({ name: trimmed });
            } else if (!trimmed) {
              setNameDraft(door.name);
            }
          }}
          placeholder="Door name"
        />
        <button
          type="button"
          onClick={deleteDoor}
          aria-label="Delete door"
          className="flex h-12 w-12 items-center justify-center rounded-lg text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Equipment
        </h3>
        {items.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No items yet.
          </p>
        )}
        <ul className="space-y-2">
          {items.map((it) => (
            <DoorItemRow
              key={it.id}
              job={job}
              door={door}
              item={it}
              supabaseUrl={supabaseUrl}
              onUpdate={(updated) =>
                onItemsChange(
                  door.id,
                  items.map((x) => (x.id === updated.id ? updated : x)),
                )
              }
              onRemove={() => removeItem(it.id)}
            />
          ))}
        </ul>

        {quickAdds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickAdds.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addItem(name)}
                className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              >
                + {name}
              </button>
            ))}
          </div>
        )}

        <CustomItemAdd onAdd={addItem} />
      </div>

      <div className="mt-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Notes
        </h3>
        <textarea
          className={textareaClass}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const next = notesDraft.trim() || null;
            if (next !== door.notes) commitField({ notes: next });
          }}
          placeholder="Notes for this door..."
        />
      </div>

      <div className="mt-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Photos
        </h3>
        <JobPhotoSection
          jobId={job.id}
          doorId={door.id}
          photos={jobPhotos}
          supabaseUrl={supabaseUrl}
          onAdded={onPhotoAdded}
          onDeleted={onPhotoDeleted}
        />
      </div>
    </li>
  );
}

function CustomItemAdd({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onAdd(value);
          setValue("");
        }
      }}
      className="flex gap-2"
    >
      <input
        className={inputClass + " flex-1"}
        placeholder="Add custom item..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="h-12 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Add
      </button>
    </form>
  );
}

function DoorItemRow({
  job,
  door,
  item,
  supabaseUrl,
  onUpdate,
  onRemove,
}: {
  job: Job;
  door: JobDoor;
  item: JobDoorItem;
  supabaseUrl: string;
  onUpdate: (item: JobDoorItem) => void;
  onRemove: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [syncedNote, setSyncedNote] = useState(item.note ?? "");
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if ((item.note ?? "") !== syncedNote) {
    setSyncedNote(item.note ?? "");
    setNoteDraft(item.note ?? "");
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    const supabase = createClient();
    const result = await uploadDoorItemPhoto({
      supabase,
      file,
      jobId: job.id,
      doorId: door.id,
      itemId: item.id,
      oldStoragePath: item.photo_storage_path,
    });
    if (photoInput.current) photoInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    onUpdate({
      ...item,
      photo_storage_path: result.storage_path,
      photo_uploaded_at: result.uploaded_at,
    });
  }

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-medium">{item.name}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 active:text-red-600 dark:active:text-red-400"
        >
          <svg
            className="h-4 w-4"
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
      </div>

      <input
        className={inputClass + " mt-2 h-9 text-sm"}
        placeholder="Note (optional)"
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          const next = noteDraft.trim() || null;
          if (next !== item.note) {
            createClient()
              .from("job_door_items")
              .update({ note: next })
              .eq("id", item.id)
              .select("*")
              .single()
              .then(({ data, error }) => {
                if (error || !data) {
                  alert(error?.message ?? "Couldn't save note.");
                  return;
                }
                onUpdate(data as JobDoorItem);
              });
          }
        }}
      />

      <div className="mt-2 flex items-center gap-2">
        {item.photo_storage_path ? (
          <a
            href={publicJobFileUrl(supabaseUrl, item.photo_storage_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-14 w-14 overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicJobFileUrl(supabaseUrl, item.photo_storage_path)}
              alt={`${item.name} photo`}
              className="h-full w-full object-cover"
            />
          </a>
        ) : null}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => photoInput.current?.click()}
          className="h-9 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          {uploading
            ? "Uploading..."
            : item.photo_storage_path
              ? "Replace photo"
              : "Add photo"}
        </button>
      </div>
    </li>
  );
}

function JobPhotoSection({
  jobId,
  doorId,
  photos,
  supabaseUrl,
  onAdded,
  onDeleted,
}: {
  jobId: string;
  doorId: string | null;
  photos: JobPhoto[];
  supabaseUrl: string;
  onAdded: (photo: JobPhoto) => void;
  onDeleted: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    fileInput.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const result = await uploadJobPhoto({ supabase, file, jobId, doorId });
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdded(result.photo);
  }

  async function remove(photo: JobPhoto) {
    if (!confirm("Delete this photo?")) return;
    const supabase = createClient();
    const result = await deleteJobPhoto(supabase, photo);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDeleted(photo.id);
  }

  return (
    <div className="space-y-2">
      {error && <ErrorBanner message={error} />}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
            >
              <a
                href={publicJobFileUrl(supabaseUrl, p.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                  alt={p.caption ?? "Job photo"}
                  className="h-full w-full object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => remove(p)}
                aria-label="Delete photo"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={pick}
        disabled={uploading}
        className="h-10 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
      >
        {uploading ? "Uploading..." : "+ Add photo"}
      </button>
    </div>
  );
}

function SiteMapSection({
  job,
  onJobUpdate,
  supabaseUrl,
}: {
  job: Job;
  onJobUpdate: (job: Job) => void;
  supabaseUrl: string;
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
    const result = await uploadSiteMap({
      supabase,
      file,
      jobId: job.id,
      oldStoragePath: job.site_map_path,
    });
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onJobUpdate({
      ...job,
      site_map_path: result.storage_path,
      site_map_uploaded_at: result.uploaded_at,
    });
  }

  async function remove() {
    if (!job.site_map_path) return;
    if (!confirm("Remove the site map PDF?")) return;
    const supabase = createClient();
    const result = await deleteSiteMap(supabase, job.id, job.site_map_path);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onJobUpdate({ ...job, site_map_path: null, site_map_uploaded_at: null });
  }

  return (
    <Section title="Site map">
      {error && <ErrorBanner message={error} />}
      {job.site_map_path ? (
        <div className="space-y-2">
          <a
            href={publicJobFileUrl(supabaseUrl, job.site_map_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
          >
            <svg
              className="h-5 w-5 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="flex-1 truncate">Site map.pdf</span>
            <span className="text-[11px] text-neutral-400">View</span>
          </a>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="h-10 flex-1 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              {uploading ? "Uploading..." : "Replace PDF"}
            </button>
            <button
              type="button"
              onClick={remove}
              className="h-10 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-600 dark:border-red-900 dark:text-red-400"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="h-12 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          {uploading ? "Uploading..." : "+ Upload site map PDF"}
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onChange}
      />
    </Section>
  );
}

function DeleteJobSection({
  jobId,
  jobName,
}: {
  jobId: string;
  jobName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (
      !confirm(
        `Delete "${jobName}"? This removes all doors, items, photos, and the site map.`,
      )
    )
      return;
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.from("jobs").delete().eq("id", jobId);
    if (error) {
      alert(error.message);
      setPending(false);
      return;
    }
    router.push("/jobs");
    router.refresh();
  }

  return (
    <section className="pt-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="h-12 w-full rounded-lg border border-red-300 text-sm font-medium text-red-600 transition active:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
      >
        {pending ? "Deleting..." : "Delete job"}
      </button>
    </section>
  );
}
