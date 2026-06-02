"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  compareCanonicalItems,
  compareDoorNames,
  type Job,
  type JobDoor,
  type JobDoorItem,
  type JobPanel,
  type JobPanelDoor,
} from "@/lib/jobs";
import {
  deleteJobPhoto,
  deleteSiteMap,
  publicJobFileUrl,
  uploadDoorItemPhoto,
  uploadJobPhoto,
  uploadPanelPhoto,
  uploadSiteMap,
  type JobPhoto,
} from "@/lib/job-photos";
import { HUGS_TEMPLATE } from "@/lib/job-templates";
import {
  deleteDoorAction,
  deleteDoorItemAction,
} from "@/app/jobs/[id]/actions";
import { AutoDetectModal } from "./AutoDetectModal";

// Doors with this exact name are the synthetic bucket created by the
// auto-detect import for unlabeled standalone equipment (gateways,
// etc). They aren't real doors, so they're excluded from door counts
// and rendered as their own section below the floor groups.
const STANDALONE_DOOR_NAME = "Standalone Equipment";

const inputClass =
  "block h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

const textareaClass =
  "block min-h-[88px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

export function JobDetailClient({
  initialJob,
  initialDoors,
  initialItems,
  initialPhotos,
  initialPanels,
  initialPanelDoors,
  doorsLoadError,
  itemsLoadError,
  photosLoadError,
}: {
  initialJob: Job;
  initialDoors: JobDoor[];
  initialItems: JobDoorItem[];
  initialPhotos: JobPhoto[];
  initialPanels: JobPanel[];
  initialPanelDoors: JobPanelDoor[];
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
  const [panels, setPanels] = useState(initialPanels);
  const [panelDoors, setPanelDoors] = useState(initialPanelDoors);
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);

  // Tracks door IDs belonging to this job. job_door_items has no job_id
  // column so we filter incoming item events client-side via this set.
  const doorIdsRef = useRef(new Set(initialDoors.map((d) => d.id)));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job-${initialJob.id}-live`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${initialJob.id}`,
        },
        (payload) => {
          setJob(payload.new as Job);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_doors",
          filter: `job_id=eq.${initialJob.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as JobDoor;
            doorIdsRef.current.add(next.id);
            setDoors((current) =>
              current.some((d) => d.id === next.id)
                ? current
                : [...current, next],
            );
          } else if (payload.eventType === "UPDATE") {
            const next = payload.new as JobDoor;
            setDoors((current) =>
              current.map((d) => (d.id === next.id ? next : d)),
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            doorIdsRef.current.delete(oldId);
            setDoors((current) => current.filter((d) => d.id !== oldId));
            setItems((current) =>
              current.filter((it) => it.door_id !== oldId),
            );
            setPhotos((current) =>
              current.filter((p) => p.door_id !== oldId),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_door_items" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as JobDoorItem;
            if (!doorIdsRef.current.has(next.door_id)) return;
            setItems((current) =>
              current.some((it) => it.id === next.id)
                ? current
                : [...current, next],
            );
          } else if (payload.eventType === "UPDATE") {
            const next = payload.new as JobDoorItem;
            if (!doorIdsRef.current.has(next.door_id)) return;
            setItems((current) =>
              current.map((it) => (it.id === next.id ? next : it)),
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id: string };
            setItems((current) => current.filter((it) => it.id !== oldRow.id));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=eq.${initialJob.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as JobPhoto;
            setPhotos((current) =>
              current.some((p) => p.id === next.id)
                ? current
                : [next, ...current],
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setPhotos((current) => current.filter((p) => p.id !== oldId));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialJob.id]);

  const [headerDraft, setHeaderDraft] = useState({
    name: initialJob.name,
    number: initialJob.number ?? "",
    address: initialJob.address ?? "",
    notes: initialJob.notes ?? "",
  });
  const [syncedHeader, setSyncedHeader] = useState({
    name: initialJob.name,
    number: initialJob.number ?? "",
    address: initialJob.address ?? "",
    notes: initialJob.notes ?? "",
  });
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  // Sync header drafts with realtime job updates, but preserve any
  // field the user has typed into since the last server snapshot.
  const currentJobHeader = {
    name: job.name,
    number: job.number ?? "",
    address: job.address ?? "",
    notes: job.notes ?? "",
  };
  if (
    currentJobHeader.name !== syncedHeader.name ||
    currentJobHeader.number !== syncedHeader.number ||
    currentJobHeader.address !== syncedHeader.address ||
    currentJobHeader.notes !== syncedHeader.notes
  ) {
    setHeaderDraft((draft) => ({
      name:
        draft.name === syncedHeader.name ? currentJobHeader.name : draft.name,
      number:
        draft.number === syncedHeader.number
          ? currentJobHeader.number
          : draft.number,
      address:
        draft.address === syncedHeader.address
          ? currentJobHeader.address
          : draft.address,
      notes:
        draft.notes === syncedHeader.notes
          ? currentJobHeader.notes
          : draft.notes,
    }));
    setSyncedHeader(currentJobHeader);
  }

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
      list.sort(compareCanonicalItems);
    }
    return map;
  }, [items]);

  const completionStats = useMemo(() => {
    const total = items.length;
    const done = items.filter((it) => it.completed_at).length;
    return { total, done };
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  async function persistDoorOrder(reordered: JobDoor[]) {
    const supabase = createClient();
    const updates = reordered.map((d, idx) =>
      supabase.from("job_doors").update({ position: idx }).eq("id", d.id),
    );
    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      alert(`Couldn't save door order: ${firstError.error.message}`);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = doors.findIndex((d) => d.id === active.id);
    const newIndex = doors.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(doors, oldIndex, newIndex).map((d, idx) => ({
      ...d,
      position: idx,
    }));
    setDoors(reordered);
    void persistDoorOrder(reordered);
  }

  function sortAlphabetically() {
    const sorted = [...doors]
      .sort((a, b) => compareDoorNames(a.name, b.name))
      .map((d, idx) => ({ ...d, position: idx }));
    setDoors(sorted);
    void persistDoorOrder(sorted);
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-32 pt-4">
      <JobSummaryCard
        job={job}
        completionStats={completionStats}
        doorCount={doors.filter((d) => d.name !== STANDALONE_DOOR_NAME).length}
        photoCount={photos.length}
      />

      {(() => {
        const regularDoors = doors.filter(
          (d) => d.name !== STANDALONE_DOOR_NAME,
        );
        const standaloneDoor = doors.find(
          (d) => d.name === STANDALONE_DOOR_NAME,
        );
        const distinctFloors = Array.from(
          new Set(regularDoors.map((d) => d.floor ?? null)),
        );
        const useFloorGroups =
          distinctFloors.length > 1 ||
          (distinctFloors.length === 1 && distinctFloors[0] !== null);

        const headerControls = (
          <div className="flex items-center gap-1">
            {doors.length >= 2 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  sortAlphabetically();
                }}
                aria-label="Sort doors A to Z"
                className="h-8 rounded-md border border-neutral-300 px-2 text-[11px] font-medium text-neutral-700 transition active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
              >
                A→Z
              </button>
            )}
            <AddDoorMenu
              jobId={job.id}
              existingCount={doors.length}
              onAdded={(door, newItems) => {
                setDoors((d) => [...d, door]);
                if (newItems.length) setItems((i) => [...i, ...newItems]);
              }}
            />
          </div>
        );

        const renderDoor = (door: JobDoor) => (
          <SortableDoorCard
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
              setPhotos((current) => current.filter((p) => p.door_id !== id));
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
        );

        const errorBanners = (
          <>
            {doorsLoadError && (
              <ErrorBanner message={`Doors load error: ${doorsLoadError}`} />
            )}
            {itemsLoadError && (
              <ErrorBanner message={`Items load error: ${itemsLoadError}`} />
            )}
          </>
        );

        const emptyState = (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No doors yet. Tap{" "}
            <span className="font-medium">+ Door</span> to add one.
          </p>
        );

        const standaloneItems = standaloneDoor
          ? itemsByDoor.get(standaloneDoor.id) ?? []
          : [];
        const standaloneDone = standaloneItems.filter(
          (it) => it.completed_at,
        ).length;

        const standaloneSection = standaloneDoor ? (
          <CollapsibleSection
            title={`Standalone equipment — ${standaloneItems.length} ${standaloneItems.length === 1 ? "item" : "items"}${standaloneItems.length ? ` · ${standaloneDone}/${standaloneItems.length}` : ""}`}
            storageKey={`hd:job:${initialJob.id}:standalone`}
          >
            <ul className="space-y-3">{renderDoor(standaloneDoor)}</ul>
          </CollapsibleSection>
        ) : null;

        if (!useFloorGroups) {
          return (
            <>
              <CollapsibleSection
                title={`Doors (${regularDoors.length})`}
                defaultOpen
                storageKey={`hd:job:${initialJob.id}:doors`}
                rightHeader={headerControls}
              >
                {errorBanners}
                {regularDoors.length === 0 ? (
                  emptyState
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={regularDoors.map((d) => d.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-3">
                        {regularDoors.map(renderDoor)}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </CollapsibleSection>
              {standaloneSection}
            </>
          );
        }

        const floorOrder = distinctFloors.sort((a, b) => {
          if (a === null) return 1;
          if (b === null) return -1;
          return a.localeCompare(b, undefined, { numeric: true });
        });

        return (
          <>
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
              <span className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                Doors ({regularDoors.length})
              </span>
              {headerControls}
            </div>
            {errorBanners}
            {regularDoors.length === 0 && emptyState}
            {floorOrder.map((floor) => {
              const floorDoors = regularDoors.filter(
                (d) => (d.floor ?? null) === floor,
              );
              const total = floorDoors.reduce(
                (sum, d) => sum + (itemsByDoor.get(d.id)?.length ?? 0),
                0,
              );
              const done = floorDoors.reduce(
                (sum, d) =>
                  sum +
                  (itemsByDoor.get(d.id)?.filter((it) => it.completed_at)
                    .length ?? 0),
                0,
              );
              return (
                <CollapsibleSection
                  key={floor ?? "__unassigned"}
                  title={`${floor ?? "Unassigned"} — ${floorDoors.length} ${
                    floorDoors.length === 1 ? "door" : "doors"
                  }${total ? ` · ${done}/${total}` : ""}`}
                  storageKey={`hd:job:${initialJob.id}:floor:${floor ?? "_unassigned"}`}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={floorDoors.map((d) => d.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-3">
                        {floorDoors.map(renderDoor)}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </CollapsibleSection>
              );
            })}
            {standaloneSection}
          </>
        );
      })()}

      <CollapsibleSection
        title={`Panels (${panels.length})`}
        storageKey={`hd:job:${initialJob.id}:panels`}
        rightHeader={
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const supabase = createClient();
              const nextName = `Panel ${panels.length + 1}`;
              const { data, error } = await supabase
                .from("job_panels")
                .insert({
                  job_id: job.id,
                  name: nextName,
                  position: panels.length,
                })
                .select("*")
                .single();
              if (error || !data) {
                alert(error?.message ?? "Couldn't add panel.");
                return;
              }
              setPanels((current) => [...current, data as JobPanel]);
            }}
            className="h-9 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            + Panel
          </button>
        }
      >
        {panels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No panels yet. Tap{" "}
            <span className="font-medium">+ Panel</span> to add one.
          </p>
        ) : (
          <ul className="space-y-3">
            {panels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                jobId={job.id}
                allDoors={doors.filter(
                  (d) => d.name !== STANDALONE_DOOR_NAME,
                )}
                panelDoorIds={panelDoors
                  .filter((pd) => pd.panel_id === panel.id)
                  .map((pd) => pd.door_id)}
                supabaseUrl={supabaseUrl}
                onPanelUpdate={(updated) =>
                  setPanels((current) =>
                    current.map((p) => (p.id === updated.id ? updated : p)),
                  )
                }
                onPanelDelete={(id) => {
                  setPanels((current) => current.filter((p) => p.id !== id));
                  setPanelDoors((current) =>
                    current.filter((pd) => pd.panel_id !== id),
                  );
                }}
                onPanelDoorsChange={(panelId, doorIds) => {
                  setPanelDoors((current) => [
                    ...current.filter((pd) => pd.panel_id !== panelId),
                    ...doorIds.map((doorId, idx) => ({
                      panel_id: panelId,
                      door_id: doorId,
                      position: idx,
                      created_at: new Date().toISOString(),
                    })),
                  ]);
                }}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Site map"
        defaultOpen={!!job.site_map_path}
        storageKey={`hd:job:${initialJob.id}:sitemap`}
      >
        <SiteMapBody
          job={job}
          onJobUpdate={(j) => setJob(j)}
          supabaseUrl={supabaseUrl}
          onOpenAutoDetect={() => setAutoDetectOpen(true)}
        />
      </CollapsibleSection>

      <AutoDetectModal
        jobId={job.id}
        open={autoDetectOpen}
        onClose={() => setAutoDetectOpen(false)}
        onImported={async () => {
          const supabase = createClient();
          const { data: refreshedDoors } = await supabase
            .from("job_doors")
            .select("*")
            .eq("job_id", job.id)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true });
          setDoors((refreshedDoors ?? []) as JobDoor[]);
          const doorIds = (refreshedDoors ?? []).map((d) => d.id);
          if (doorIds.length > 0) {
            const { data: refreshedItems } = await supabase
              .from("job_door_items")
              .select("*")
              .in("door_id", doorIds)
              .order("position", { ascending: true })
              .order("created_at", { ascending: true });
            setItems((refreshedItems ?? []) as JobDoorItem[]);
          }
        }}
      />

      <CollapsibleSection
        title={`Job photos (${photos.filter((p) => !p.door_id).length})`}
        storageKey={`hd:job:${initialJob.id}:photos`}
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        title="Job details"
        storageKey={`hd:job:${initialJob.id}:details`}
      >
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
      </CollapsibleSection>

      <div className="pt-1 text-center">
        <a
          href={`/jobs/${job.id}/history`}
          className="text-sm font-medium text-neutral-500 underline underline-offset-4 active:text-neutral-900 dark:text-neutral-400 dark:active:text-neutral-100"
        >
          View history
        </a>
      </div>

      <DeleteJobSection jobId={job.id} jobName={job.name} />
    </main>
  );
}

function JobSummaryCard({
  job,
  completionStats,
  doorCount,
  photoCount,
}: {
  job: Job;
  completionStats: { done: number; total: number };
  doorCount: number;
  photoCount: number;
}) {
  const pct =
    completionStats.total === 0
      ? 0
      : Math.round((completionStats.done / completionStats.total) * 100);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {(job.number || job.address) && (
        <div className="mb-3 space-y-0.5 text-sm">
          {job.number && (
            <p className="text-neutral-600 dark:text-neutral-400">
              Job # <span className="font-medium text-neutral-900 dark:text-neutral-100">{job.number}</span>
            </p>
          )}
          {job.address && (
            <p className="text-neutral-600 dark:text-neutral-400">
              {job.address}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Progress
          </span>
          <span className="text-base font-semibold">
            {completionStats.done} / {completionStats.total} items
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>
            {doorCount} {doorCount === 1 ? "door" : "doors"}
          </span>
          <span>
            {photoCount} {photoCount === 1 ? "photo" : "photos"}
          </span>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  storageKey,
  rightHeader,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  storageKey?: string;
  rightHeader?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Read once from localStorage when the storageKey first appears on the
  // client. In-render setState is allowed once-per-mount via the sentinel.
  const [syncedKey, setSyncedKey] = useState<string | null | undefined>(
    undefined,
  );
  if (typeof window !== "undefined" && syncedKey !== (storageKey ?? null)) {
    setSyncedKey(storageKey ?? null);
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) setOpen(stored === "true");
      } catch {
        // localStorage unavailable (private mode etc) — keep defaultOpen.
      }
    }
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // Ignore — best-effort persistence.
      }
    }
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-800"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <svg
            className={
              "h-4 w-4 text-neutral-400 transition-transform " +
              (open ? "rotate-90" : "")
            }
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            {title}
          </span>
        </span>
        {rightHeader && <span onClick={(e) => e.stopPropagation()}>{rightHeader}</span>}
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
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
      const names = [...HUGS_TEMPLATE.requiredItems, "Door contact"];
      const itemRows = names.map((name, idx) => ({
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

type DoorCardProps = {
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
};

function SortableDoorCard(props: DoorCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.door.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li ref={setNodeRef} style={style}>
      <DoorCard
        {...props}
        dragHandle={
          <button
            type="button"
            aria-label={`Drag to reorder ${props.door.name}`}
            className="flex h-10 w-8 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded text-neutral-400 active:cursor-grabbing active:bg-neutral-200 dark:text-neutral-500 dark:active:bg-neutral-800"
            {...attributes}
            {...listeners}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
        }
      />
    </li>
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
  dragHandle,
}: DoorCardProps & { dragHandle?: React.ReactNode }) {
  const expandKey = `hd:job:${job.id}:door:${door.id}`;
  const [expanded, setExpanded] = useState(false);
  const [expandSynced, setExpandSynced] = useState(false);
  if (typeof window !== "undefined" && !expandSynced) {
    setExpandSynced(true);
    try {
      const stored = localStorage.getItem(expandKey);
      if (stored !== null) setExpanded(stored === "true");
    } catch {
      // localStorage unavailable — keep default.
    }
  }
  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(expandKey, String(next));
      } catch {
        // Ignore — best-effort persistence.
      }
    }
  }

  const [nameDraft, setNameDraft] = useState(door.name);
  const [notesDraft, setNotesDraft] = useState(door.notes ?? "");
  const [floorDraft, setFloorDraft] = useState(door.floor ?? "");
  const [syncedName, setSyncedName] = useState(door.name);
  const [syncedNotes, setSyncedNotes] = useState(door.notes ?? "");
  const [syncedFloor, setSyncedFloor] = useState(door.floor ?? "");

  // Realtime-aware sync: only overwrite the draft if the user hasn't
  // started editing (draft still matches the last value we saw from
  // the server). If they've typed, preserve their edit.
  if (door.name !== syncedName) {
    if (nameDraft === syncedName) setNameDraft(door.name);
    setSyncedName(door.name);
  }
  if ((door.notes ?? "") !== syncedNotes) {
    if (notesDraft === syncedNotes) setNotesDraft(door.notes ?? "");
    setSyncedNotes(door.notes ?? "");
  }
  if ((door.floor ?? "") !== syncedFloor) {
    if (floorDraft === syncedFloor) setFloorDraft(door.floor ?? "");
    setSyncedFloor(door.floor ?? "");
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

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteDoor() {
    setDeleting(true);
    const result = await deleteDoorAction(door.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      alert(`Couldn't delete: ${result.error}`);
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
    const result = await deleteDoorItemAction(id);
    if (!result.ok) {
      alert(`Couldn't remove: ${result.error}`);
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
    "Door contact",
    "REX",
  ].filter((n) => !usedNames.has(n));

  const completedCount = items.filter((it) => it.completed_at).length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-2">
        {dragHandle}
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? "Collapse door" : "Expand door"}
          aria-expanded={expanded}
          className="flex h-10 w-7 flex-shrink-0 items-center justify-center rounded text-neutral-400 active:bg-neutral-200 dark:active:bg-neutral-800"
        >
          <svg
            className={"h-4 w-4 transition-transform " + (expanded ? "rotate-90" : "")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
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
        {items.length > 0 && (
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-medium " +
              (completedCount === items.length
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
            }
            aria-label={`${completedCount} of ${items.length} items done`}
          >
            {completedCount}/{items.length}
          </span>
        )}
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={deleteDoor}
              disabled={deleting}
              aria-label={`Confirm delete ${door.name}`}
              className="h-10 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              {deleting ? "..." : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              aria-label="Cancel delete"
              className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete door"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
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
        )}
      </div>

      {expanded && (
        <>
          <label className="mt-2 flex items-center gap-2 pl-7">
            <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Floor
            </span>
            <input
              className="h-8 flex-1 rounded border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="optional"
              value={floorDraft}
              onChange={(e) => setFloorDraft(e.target.value)}
              onBlur={() => {
                const next = floorDraft.trim() || null;
                if (next !== door.floor) commitField({ floor: next });
              }}
            />
          </label>

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
        </>
      )}
    </div>
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
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [syncedNote, setSyncedNote] = useState(item.note ?? "");
  const [uploading, setUploading] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if ((item.note ?? "") !== syncedNote) {
    if (noteDraft === syncedNote) setNoteDraft(item.note ?? "");
    setSyncedNote(item.note ?? "");
  }

  async function saveNote(next: string | null) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_door_items")
      .update({ note: next })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't save note.");
      return;
    }
    onUpdate(data as JobDoorItem);
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

  async function removePhoto() {
    if (!item.photo_storage_path) return;
    if (!confirm("Remove this photo?")) return;
    const supabase = createClient();
    await supabase.storage.from("job-files").remove([item.photo_storage_path]);
    const { data, error } = await supabase
      .from("job_door_items")
      .update({ photo_storage_path: null, photo_uploaded_at: null })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't remove photo.");
      return;
    }
    onUpdate(data as JobDoorItem);
  }

  async function toggleComplete() {
    const nextCompletedAt = item.completed_at ? null : new Date().toISOString();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_door_items")
      .update({ completed_at: nextCompletedAt })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't update item.");
      return;
    }
    onUpdate(data as JobDoorItem);
  }

  const isDone = !!item.completed_at;
  const hasNote = !!item.note;
  const hasPhoto = !!item.photo_storage_path;

  return (
    <li
      className={
        "rounded-lg border p-2.5 transition " +
        (isDone
          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900")
      }
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleComplete}
          aria-label={isDone ? `Mark ${item.name} not done` : `Mark ${item.name} done`}
          aria-pressed={isDone}
          className={
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition " +
            (isDone
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900")
          }
        >
          {isDone && (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        {hasPhoto && (
          <a
            href={publicJobFileUrl(supabaseUrl, item.photo_storage_path!)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${item.name} photo`}
            className="block h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicJobFileUrl(supabaseUrl, item.photo_storage_path!)}
              alt=""
              className="h-full w-full object-cover"
            />
          </a>
        )}
        <p
          className={
            "flex-1 truncate text-sm font-medium " +
            (isDone ? "text-neutral-400 line-through dark:text-neutral-500" : "")
          }
        >
          {item.name}
        </p>
        <button
          type="button"
          onClick={() => setActionsOpen((v) => !v)}
          aria-label={`More actions for ${item.name}`}
          aria-expanded={actionsOpen}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-500 active:bg-neutral-100 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
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

      {hasNote && !noteEditing && (
        <button
          type="button"
          onClick={() => setNoteEditing(true)}
          className="mt-1.5 block w-full text-left text-xs italic text-neutral-600 dark:text-neutral-400"
        >
          “{item.note}”
        </button>
      )}

      {noteEditing && (
        <input
          autoFocus
          className={inputClass + " mt-2 h-9 text-sm"}
          placeholder="Note for this item"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            const next = noteDraft.trim() || null;
            setNoteEditing(false);
            if (next !== item.note) void saveNote(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setNoteDraft(item.note ?? "");
              setNoteEditing(false);
            }
          }}
        />
      )}

      {actionsOpen && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setNoteEditing(true);
              setActionsOpen(false);
            }}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-900"
          >
            {hasNote ? "Edit note" : "+ Note"}
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              photoInput.current?.click();
              setActionsOpen(false);
            }}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {uploading
              ? "Uploading..."
              : hasPhoto
                ? "Replace photo"
                : "+ Photo"}
          </button>
          {hasNote && (
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                void saveNote(null);
              }}
              className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-neutral-900 dark:text-red-400"
            >
              Remove note
            </button>
          )}
          {hasPhoto && (
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                void removePhoto();
              }}
              className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-neutral-900 dark:text-red-400"
            >
              Remove photo
            </button>
          )}
        </div>
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadPhoto(f);
        }}
      />
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

function PanelCard({
  panel,
  jobId,
  allDoors,
  panelDoorIds,
  supabaseUrl,
  onPanelUpdate,
  onPanelDelete,
  onPanelDoorsChange,
}: {
  panel: JobPanel;
  jobId: string;
  allDoors: JobDoor[];
  panelDoorIds: string[];
  supabaseUrl: string;
  onPanelUpdate: (panel: JobPanel) => void;
  onPanelDelete: (id: string) => void;
  onPanelDoorsChange: (panelId: string, doorIds: string[]) => void;
}) {
  const [nameDraft, setNameDraft] = useState(panel.name);
  const [commDraft, setCommDraft] = useState(panel.comm_room ?? "");
  const [syncedName, setSyncedName] = useState(panel.name);
  const [syncedComm, setSyncedComm] = useState(panel.comm_room ?? "");
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickingDoor, setPickingDoor] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if (panel.name !== syncedName) {
    if (nameDraft === syncedName) setNameDraft(panel.name);
    setSyncedName(panel.name);
  }
  if ((panel.comm_room ?? "") !== syncedComm) {
    if (commDraft === syncedComm) setCommDraft(panel.comm_room ?? "");
    setSyncedComm(panel.comm_room ?? "");
  }

  async function commit(patch: Partial<JobPanel>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_panels")
      .update(patch)
      .eq("id", panel.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't save panel.");
      return;
    }
    onPanelUpdate(data as JobPanel);
  }

  async function deletePanel() {
    setDeleting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("job_panels")
      .delete()
      .eq("id", panel.id)
      .select("id");
    setDeleting(false);
    setConfirmingDelete(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("No rows affected.");
      return;
    }
    onPanelDelete(panel.id);
  }

  async function addDoor(doorId: string) {
    const supabase = createClient();
    const next = [...panelDoorIds, doorId];
    const { error } = await supabase
      .from("job_panel_doors")
      .insert({
        panel_id: panel.id,
        door_id: doorId,
        position: next.length - 1,
      });
    if (error) {
      alert(error.message);
      return;
    }
    onPanelDoorsChange(panel.id, next);
    setPickingDoor(false);
  }

  async function removeDoor(doorId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("job_panel_doors")
      .delete()
      .eq("panel_id", panel.id)
      .eq("door_id", doorId);
    if (error) {
      alert(error.message);
      return;
    }
    onPanelDoorsChange(
      panel.id,
      panelDoorIds.filter((id) => id !== doorId),
    );
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    const supabase = createClient();
    const result = await uploadPanelPhoto({
      supabase,
      file,
      jobId,
      panelId: panel.id,
      oldStoragePath: panel.photo_storage_path,
    });
    if (photoInput.current) photoInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    onPanelUpdate({
      ...panel,
      photo_storage_path: result.storage_path,
      photo_uploaded_at: result.uploaded_at,
    });
  }

  const doorMap = new Map(allDoors.map((d) => [d.id, d]));
  const linkedDoors = panelDoorIds
    .map((id) => doorMap.get(id))
    .filter((d): d is JobDoor => !!d);
  const availableDoors = allDoors.filter((d) => !panelDoorIds.includes(d.id));

  return (
    <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-2">
        <input
          className={inputClass + " flex-1"}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== panel.name) {
              void commit({ name: trimmed });
            } else if (!trimmed) {
              setNameDraft(panel.name);
            }
          }}
          placeholder="Panel name"
        />
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={deletePanel}
              disabled={deleting}
              className="h-10 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "..." : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete panel"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
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
            </svg>
          </button>
        )}
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Comm room / location
        </span>
        <input
          className={inputClass + " h-10 text-sm"}
          placeholder="optional — e.g. 'Comm 312' or '3rd-floor IDF'"
          value={commDraft}
          onChange={(e) => setCommDraft(e.target.value)}
          onBlur={() => {
            const next = commDraft.trim() || null;
            if (next !== panel.comm_room) void commit({ comm_room: next });
          }}
        />
      </label>

      <div className="mt-3">
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Doors on this panel
        </h4>
        {linkedDoors.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            None yet.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {linkedDoors.map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-900"
            >
              {d.name}
              <button
                type="button"
                onClick={() => removeDoor(d.id)}
                aria-label={`Remove ${d.name} from panel`}
                className="text-neutral-400 active:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
          {availableDoors.length > 0 && !pickingDoor && (
            <button
              type="button"
              onClick={() => setPickingDoor(true)}
              className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
            >
              + door
            </button>
          )}
        </div>
        {pickingDoor && (
          <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Tap a door to add
              </span>
              <button
                type="button"
                onClick={() => setPickingDoor(false)}
                className="text-[11px] text-neutral-500 dark:text-neutral-400"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableDoors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => addDoor(d.id)}
                  className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  + {d.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Photo
        </h4>
        <div className="flex items-center gap-2">
          {panel.photo_storage_path ? (
            <a
              href={publicJobFileUrl(supabaseUrl, panel.photo_storage_path)}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-20 w-20 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicJobFileUrl(supabaseUrl, panel.photo_storage_path)}
                alt={`${panel.name} photo`}
                className="h-full w-full object-cover"
              />
            </a>
          ) : null}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
            }}
          />
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={uploading}
            className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            {uploading
              ? "Uploading..."
              : panel.photo_storage_path
                ? "Replace photo"
                : "Add photo"}
          </button>
        </div>
      </div>
    </li>
  );
}

function SiteMapBody({
  job,
  onJobUpdate,
  supabaseUrl,
  onOpenAutoDetect,
}: {
  job: Job;
  onJobUpdate: (job: Job) => void;
  supabaseUrl: string;
  onOpenAutoDetect: () => void;
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
    <>
      {error && <ErrorBanner message={error} />}
      {job.site_map_path ? (
        <div className="space-y-2">
          <object
            data={publicJobFileUrl(supabaseUrl, job.site_map_path) + "#view=FitH"}
            type="application/pdf"
            className="h-[65vh] w-full rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
            aria-label="Site map PDF"
          >
            <a
              href={publicJobFileUrl(supabaseUrl, job.site_map_path)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-neutral-600 dark:text-neutral-400"
            >
              Your browser can&apos;t render PDFs inline. Tap to open.
            </a>
          </object>
          <a
            href={publicJobFileUrl(supabaseUrl, job.site_map_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[11px] font-medium text-neutral-500 underline-offset-2 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
          >
            Open fullscreen
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
          <button
            type="button"
            onClick={onOpenAutoDetect}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-medium text-white active:scale-[0.98] dark:bg-indigo-500"
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
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
            Auto-detect doors from PDF
            <span className="ml-1 text-[10px] font-normal italic opacity-80">
              Beta
            </span>
          </button>
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
    </>
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
    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", jobId)
      .select("id");
    if (error) {
      alert(error.message);
      setPending(false);
      return;
    }
    if (!data || data.length === 0) {
      alert(
        "Couldn't delete the job — no rows affected. Try signing out and back in.",
      );
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
