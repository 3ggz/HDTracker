"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  type JobDoorItemPhoto,
  type JobPanel,
  type JobPanelDoor,
  type JobPanelPhoto,
} from "@/lib/jobs";
import {
  deleteDoorItemPhoto,
  deleteExtraSiteMap,
  deleteJobPhoto,
  deletePanelPhoto,
  deleteSiteMap,
  publicJobFileUrl,
  renameExtraSiteMap,
  restoreDoorItemPhoto,
  restoreExtraSiteMap,
  restoreJobPhoto,
  restorePanelPhoto,
  uploadDoorItemPhoto,
  uploadExtraSiteMap,
  uploadJobPhoto,
  uploadPanelPhoto,
  uploadSiteMap,
  type JobPhoto,
  type JobSiteMap,
} from "@/lib/job-photos";
import {
  HUGS_TEMPLATE,
  HUGS_TEMPLATE_ID,
  HUGS_DOOR_TEMPLATE,
  type DoorTemplate,
} from "@/lib/job-templates";
import { firstNameFromEmail } from "@/lib/email";
import { useSoftDelete } from "@/lib/use-soft-delete";
import { PdfFullscreenModal } from "./PdfFullscreenModal";
import { UndoBanner } from "./UndoBanner";
import {
  deleteDoorAction,
  deleteJobAction,
  restoreDoorItemAction,
  deleteDoorItemAction,
  restoreDoorAction,
  type RestoreDoorInput,
} from "@/app/jobs/[id]/actions";
import { AutoDetectModal } from "./AutoDetectModal";

// Doors with this exact name are the synthetic bucket created by the
// auto-detect import for unlabeled standalone equipment (gateways,
// etc). They aren't real doors, so they're excluded from door counts
// and rendered as their own section below the floor groups.
const STANDALONE_DOOR_NAME = "Standalone Equipment";

// A door can be wired up with more than one 5200 / 3220 exciter, so
// the quick-add chip for those stays available even after one is
// added. Everything else hides once present.
const REPEATABLE_ITEMS = new Set(["5200 Exciter", "3220 Exciter"]);

// Shared save-tracker so the universal "saving / saved" bar at the
// bottom of the page reflects activity from every child component
// (door fields, panel fields, item toggles, photo uploads, etc.)
// without having to plumb status props through every level.
type SaveTracker = { begin: () => void; end: () => void };
const noopTracker: SaveTracker = { begin: () => {}, end: () => {} };
const SaveTrackerContext = createContext<SaveTracker>(noopTracker);
async function withTrack<T>(
  tracker: SaveTracker,
  fn: () => Promise<T>,
): Promise<T> {
  tracker.begin();
  try {
    return await fn();
  } finally {
    tracker.end();
  }
}

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
  initialItemPhotos,
  initialPanelPhotos,
  doorsLoadError,
  itemsLoadError,
  photosLoadError,
  canDeleteJob,
  initialExtraSiteMaps,
  initialDerivedWorkers,
  initialMemberSuggestions,
}: {
  initialJob: Job;
  initialDoors: JobDoor[];
  initialItems: JobDoorItem[];
  initialPhotos: JobPhoto[];
  initialPanels: JobPanel[];
  initialPanelDoors: JobPanelDoor[];
  initialItemPhotos: JobDoorItemPhoto[];
  initialPanelPhotos: JobPanelPhoto[];
  doorsLoadError: string | null;
  itemsLoadError: string | null;
  photosLoadError: string | null;
  canDeleteJob: boolean;
  initialExtraSiteMaps: JobSiteMap[];
  // Distinct user emails pulled from job_activity at SSR. Live updates
  // here would require a separate channel; for now the list rehydrates
  // on navigation, which is fine — the manual list IS realtime via
  // the existing job UPDATE subscription.
  initialDerivedWorkers: string[];
  // Fleet-wide unique names ever associated with a job — used to
  // pre-populate the Worked-on autocomplete dropdown.
  initialMemberSuggestions: string[];
}) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const [job, setJob] = useState(initialJob);
  const [doors, setDoors] = useState(initialDoors);
  const [items, setItems] = useState(initialItems);
  const [photos, setPhotos] = useState(initialPhotos);
  const [panels, setPanels] = useState(initialPanels);
  const [panelDoors, setPanelDoors] = useState(initialPanelDoors);
  const [itemPhotos, setItemPhotos] = useState(initialItemPhotos);
  const [panelPhotos, setPanelPhotos] = useState(initialPanelPhotos);
  const [extraSiteMaps, setExtraSiteMaps] = useState(initialExtraSiteMaps);
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);
  const [newDoorId, setNewDoorId] = useState<string | null>(null);

  // Door-creation template registry. HUGS is always pinned at the
  // front; DB-backed user templates are appended. Selection persists
  // per-device via localStorage so a tech picks once and keeps it.
  const [dbTemplates, setDbTemplates] = useState<DoorTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<string>(HUGS_TEMPLATE_ID);
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);

  // Restore last-used template id from localStorage once on mount.
  // Falls back to HUGS if the stored id no longer resolves (template
  // was deleted on another device).
  useEffect(() => {
    try {
      const stored = localStorage.getItem("hd:job:template:default");
      if (stored) setSelectedTemplateId(stored);
    } catch {
      // localStorage unavailable — keep HUGS default.
    }
  }, []);

  async function loadTemplates() {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("job_templates")
      .select("id, name, job_template_items(name, position)")
      .order("name");
    if (!rows) return;
    const next: DoorTemplate[] = rows.map((r) => {
      const itemRows = (r.job_template_items ?? []) as {
        name: string;
        position: number;
      }[];
      itemRows.sort((a, b) => a.position - b.position);
      return {
        id: r.id,
        name: r.name,
        items: itemRows.map((it) => it.name),
        editable: true,
      };
    });
    setDbTemplates(next);
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  const allTemplates = useMemo<DoorTemplate[]>(
    () => [HUGS_DOOR_TEMPLATE, ...dbTemplates],
    [dbTemplates],
  );
  const selectedTemplate =
    allTemplates.find((t) => t.id === selectedTemplateId) ??
    HUGS_DOOR_TEMPLATE;

  function pickTemplate(id: string) {
    setSelectedTemplateId(id);
    try {
      localStorage.setItem("hd:job:template:default", id);
    } catch {
      // Best-effort persistence; selection still applies in-memory.
    }
  }

  async function deleteTemplate(id: string) {
    if (id === HUGS_TEMPLATE_ID) return;
    const target = dbTemplates.find((t) => t.id === id);
    if (!target) return;
    if (!window.confirm(`Delete template "${target.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("job_templates")
      .delete()
      .eq("id", id);
    if (error) {
      alert(`Couldn't delete template: ${error.message}`);
      return;
    }
    setDbTemplates((cur) => cur.filter((t) => t.id !== id));
    if (selectedTemplateId === id) pickTemplate(HUGS_TEMPLATE_ID);
  }

  // Snapshot of the most recently deleted door, kept around so the
  // top-of-page Undo button can ask the server to recreate it. We
  // only track one slot at a time — a fresh delete overwrites it.
  // Items, item-level photos, door-level photos, and panel links all
  // ride along so the restore is a faithful copy.
  const [lastDeletedDoor, setLastDeletedDoor] = useState<{
    label: string;
    payload: RestoreDoorInput;
  } | null>(null);
  const [restoringDoor, setRestoringDoor] = useState(false);

  const [pendingSaves, setPendingSaves] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimer = useRef<number | null>(null);
  const saveTracker = useMemo<SaveTracker>(
    () => ({
      begin: () => setPendingSaves((c) => c + 1),
      end: () =>
        setPendingSaves((c) => {
          const next = Math.max(0, c - 1);
          if (next === 0 && c > 0) {
            if (savedFlashTimer.current)
              window.clearTimeout(savedFlashTimer.current);
            setSavedFlash(true);
            savedFlashTimer.current = window.setTimeout(
              () => setSavedFlash(false),
              1600,
            );
          }
          return next;
        }),
    }),
    [],
  );

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
    const trimmedNumber = headerDraft.number.trim();
    if (!trimmedName) {
      setHeaderError("Job needs a name.");
      return;
    }
    if (!trimmedNumber) {
      setHeaderError("Job number is required.");
      return;
    }
    setHeaderSaving(true);
    setHeaderError(null);
    const patch = {
      name: trimmedName,
      number: trimmedNumber,
      address: headerDraft.address.trim() || null,
      notes: headerDraft.notes.trim() || null,
    };
    const { data, error } = await withTrack(saveTracker, async () => {
      const supabase = createClient();
      return supabase
        .from("jobs")
        .update(patch)
        .eq("id", job.id)
        .select("*")
        .maybeSingle();
    });
    setHeaderSaving(false);
    if (error) {
      setHeaderError(error.message);
      return;
    }
    if (!data) {
      setHeaderError(
        "Couldn't save — job may have been deleted from another tab.",
      );
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

  // One Set shared by every PanelCard instead of building a fresh
  // one per panel per render.
  const allAssignedDoorIds = useMemo(
    () => new Set(panelDoors.map((pd) => pd.door_id)),
    [panelDoors],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  async function undoLastDoorDelete() {
    if (!lastDeletedDoor || restoringDoor) return;
    // Snapshot before the first await. A newer delete can overwrite
    // lastDeletedDoor mid-flight; without the capture we'd restore
    // the wrong door (and label the alert with the wrong name).
    const { payload, label } = lastDeletedDoor;
    setRestoringDoor(true);
    try {
      const result = await withTrack(saveTracker, () =>
        restoreDoorAction(payload),
      );
      if (!result.ok) {
        alert(`Couldn't restore "${label}": ${result.error}`);
        return;
      }
      // Pull fresh rows for the recreated door so local state matches
      // the DB (new IDs, server-set timestamps, etc).
      const supabase = createClient();
      const [
        { data: doorRow },
        { data: itemRows },
        { data: photoRows },
        { data: itemPhotoRows },
        { data: panelDoorRows },
      ] = await Promise.all([
        supabase
          .from("job_doors")
          .select("*")
          .eq("id", result.doorId)
          .single(),
        supabase
          .from("job_door_items")
          .select("*")
          .eq("door_id", result.doorId),
        supabase
          .from("job_photos")
          .select("*")
          .eq("door_id", result.doorId),
        supabase
          .from("job_door_item_photos")
          .select("*")
          .in("item_id", Object.values(result.itemIdMap)),
        supabase
          .from("job_panel_doors")
          .select("*")
          .eq("door_id", result.doorId),
      ]);
      if (doorRow) {
        doorIdsRef.current.add((doorRow as JobDoor).id);
        setDoors((current) =>
          current.some((d) => d.id === (doorRow as JobDoor).id)
            ? current
            : [...current, doorRow as JobDoor],
        );
      }
      if (itemRows) {
        setItems((current) => [...current, ...(itemRows as JobDoorItem[])]);
      }
      if (photoRows) {
        setPhotos((current) => [...(photoRows as JobPhoto[]), ...current]);
      }
      if (itemPhotoRows) {
        setItemPhotos((current) => [
          ...current,
          ...(itemPhotoRows as JobDoorItemPhoto[]),
        ]);
      }
      if (panelDoorRows) {
        setPanelDoors((current) => [
          ...current,
          ...(panelDoorRows as JobPanelDoor[]),
        ]);
      }
      // Only clear the undo slot if it still refers to the door we
      // restored — a fresh delete that landed mid-restore keeps its
      // own undo available.
      setLastDeletedDoor((current) =>
        current?.payload === payload ? null : current,
      );
    } finally {
      setRestoringDoor(false);
    }
  }

  // Which floor (if any) the user is currently renaming. null when
  // not editing. We only allow renaming real floor values, not the
  // synthetic "Unassigned" bucket for null-floor doors.
  const [renamingFloor, setRenamingFloor] = useState<string | null>(null);

  async function renameFloor(oldFloor: string, nextRaw: string) {
    const next = nextRaw.trim() || null;
    if (next === oldFloor) {
      setRenamingFloor(null);
      return;
    }
    const { error } = await withTrack(saveTracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_doors")
        .update({ floor: next })
        .eq("job_id", job.id)
        .eq("floor", oldFloor);
    });
    if (error) {
      alert(`Couldn't rename floor: ${error.message}`);
      return;
    }
    setDoors((current) =>
      current.map((d) =>
        d.floor === oldFloor ? { ...d, floor: next } : d,
      ),
    );
    setRenamingFloor(null);
  }

  async function persistDoorOrder(reordered: JobDoor[]) {
    await withTrack(saveTracker, async () => {
      const supabase = createClient();
      const updates = reordered.map((d, idx) =>
        supabase.from("job_doors").update({ position: idx }).eq("id", d.id),
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) {
        alert(`Couldn't save door order: ${firstError.error.message}`);
      }
    });
  }

  async function createDoorsForPanel(
    panelId: string,
    names: string[],
  ): Promise<boolean> {
    if (names.length === 0) return true;
    const supabase = createClient();
    const existingForPanel = panelDoors.filter(
      (pd) => pd.panel_id === panelId,
    ).length;
    const baseDoorPosition = doors.length;
    let ok = true;
    await withTrack(saveTracker, async () => {
      for (let i = 0; i < names.length; i++) {
        const { data: door, error: doorError } = await supabase
          .from("job_doors")
          .insert({
            job_id: job.id,
            name: names[i],
            position: baseDoorPosition + i,
          })
          .select("*")
          .single();
        if (doorError || !door) {
          alert(doorError?.message ?? "Couldn't create door.");
          ok = false;
          return;
        }
        const itemRows = selectedTemplate.items.map((n, idx) => ({
          door_id: door.id,
          name: n,
          position: idx,
        }));
        const { data: insertedItems } = await supabase
          .from("job_door_items")
          .insert(itemRows)
          .select("*");
        const linkPosition = existingForPanel + i;
        const { error: linkError } = await supabase
          .from("job_panel_doors")
          .insert({
            panel_id: panelId,
            door_id: door.id,
            position: linkPosition,
          });
        if (linkError) {
          alert(linkError.message);
          ok = false;
          return;
        }
        doorIdsRef.current.add((door as JobDoor).id);
        setDoors((current) => [...current, door as JobDoor]);
        if (insertedItems) {
          setItems((current) => [
            ...current,
            ...(insertedItems as JobDoorItem[]),
          ]);
        }
        setPanelDoors((current) => [
          ...current,
          {
            panel_id: panelId,
            door_id: (door as JobDoor).id,
            position: linkPosition,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    });
    return ok;
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
    <SaveTrackerContext.Provider value={saveTracker}>
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-32 pt-4">
      {lastDeletedDoor && (
        <div className="sticky top-14 z-40 -mx-4 mb-2 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/60">
          <svg
            className="h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-400"
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
          <span className="flex-1 truncate text-xs font-medium text-amber-900 dark:text-amber-100">
            Deleted &ldquo;{lastDeletedDoor.label}&rdquo;
          </span>
          <button
            type="button"
            onClick={undoLastDoorDelete}
            disabled={restoringDoor}
            className="h-8 rounded-md bg-amber-600 px-3 text-[11px] font-semibold text-white shadow active:scale-95 disabled:opacity-50"
          >
            {restoringDoor ? "Restoring..." : "Undo"}
          </button>
          <button
            type="button"
            onClick={() => setLastDeletedDoor(null)}
            aria-label="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-md text-amber-700 active:bg-amber-100 dark:text-amber-400 dark:active:bg-amber-900/60"
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
      )}
      <JobSummaryCard
        job={job}
        completionStats={completionStats}
        doorCount={doors.filter((d) => d.name !== STANDALONE_DOOR_NAME).length}
        photoCount={photos.length}
      />

      {(() => {
        const regularDoorsRaw = doors.filter(
          (d) => d.name !== STANDALONE_DOOR_NAME,
        );
        // Auto-sink: tested (== completed) doors fall to the bottom of
        // whatever list they're in so the unfinished ones stay on top.
        // Relative order within each bucket preserves the existing
        // position-based sort so manual reordering still wins.
        const regularDoors = [
          ...regularDoorsRaw.filter((d) => !d.tested_at),
          ...regularDoorsRaw.filter((d) => d.tested_at),
        ];
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
            <TemplatePicker
              templates={allTemplates}
              selectedId={selectedTemplateId}
              onPick={pickTemplate}
              onCreate={() => setCreateTemplateOpen(true)}
              onDelete={(id) => void deleteTemplate(id)}
            />
            <AddDoorMenu
              jobId={job.id}
              existingCount={doors.length}
              template={selectedTemplate}
              onAdded={(door, newItems, options) => {
                doorIdsRef.current.add(door.id);
                setDoors((d) => [...d, door]);
                if (newItems.length) setItems((i) => [...i, ...newItems]);
                if (options?.focus) setNewDoorId(door.id);
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
            itemPhotos={itemPhotos}
            onDoorUpdate={(updated) =>
              setDoors((current) =>
                current.map((d) => (d.id === updated.id ? updated : d)),
              )
            }
            onDoorDelete={(id) => {
              const deletedDoor = doors.find((d) => d.id === id);
              const deletedItems = items.filter((it) => it.door_id === id);
              const doorItemIds = deletedItems.map((it) => it.id);
              const deletedItemPhotos = itemPhotos.filter((p) =>
                doorItemIds.includes(p.item_id),
              );
              const deletedJobPhotos = photos.filter((p) => p.door_id === id);
              const deletedPanelIds = panelDoors
                .filter((pd) => pd.door_id === id)
                .map((pd) => pd.panel_id);
              if (deletedDoor) {
                setLastDeletedDoor({
                  label: deletedDoor.name,
                  payload: {
                    jobId: job.id,
                    door: {
                      name: deletedDoor.name,
                      notes: deletedDoor.notes,
                      floor: deletedDoor.floor,
                      position: deletedDoor.position,
                      tested_at: deletedDoor.tested_at,
                    },
                    items: deletedItems.map((it) => ({
                      originalId: it.id,
                      name: it.name,
                      note: it.note,
                      photo_storage_path: it.photo_storage_path,
                      photo_uploaded_at: it.photo_uploaded_at,
                      completed_at: it.completed_at,
                      position: it.position,
                    })),
                    itemPhotos: deletedItemPhotos.map((p) => ({
                      originalItemId: p.item_id,
                      storage_path: p.storage_path,
                      caption: p.caption,
                      position: p.position,
                    })),
                    jobPhotos: deletedJobPhotos.map((p) => ({
                      storage_path: p.storage_path,
                      caption: p.caption,
                    })),
                    panelIds: deletedPanelIds,
                  },
                });
              }
              setDoors((current) => current.filter((d) => d.id !== id));
              setItems((current) =>
                current.filter((it) => it.door_id !== id),
              );
              setPhotos((current) => current.filter((p) => p.door_id !== id));
              setItemPhotos((current) =>
                current.filter((p) => !doorItemIds.includes(p.item_id)),
              );
              setPanelDoors((current) =>
                current.filter((pd) => pd.door_id !== id),
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
            onItemPhotoAdded={(photo) =>
              setItemPhotos((current) => [...current, photo])
            }
            onItemPhotoDeleted={(id) =>
              setItemPhotos((current) => current.filter((p) => p.id !== id))
            }
            isNewlyAdded={door.id === newDoorId}
            onFocusedNewlyAdded={() => setNewDoorId(null)}
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
            title={`Miscellaneous — ${standaloneItems.length} ${standaloneItems.length === 1 ? "item" : "items"}${standaloneItems.length ? ` · ${standaloneDone}/${standaloneItems.length}` : ""}`}
            storageKey={`hd:job:${initialJob.id}:standalone`}
          >
            <MiscellaneousSection
              door={standaloneDoor}
              items={standaloneItems}
              onItemsChange={(next) => {
                setItems((current) => [
                  ...current.filter((it) => it.door_id !== standaloneDoor.id),
                  ...next,
                ]);
              }}
            />
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
              const canRename = floor !== null;
              const isRenamingThis =
                canRename && renamingFloor === floor;
              return (
                <div key={floor ?? "__unassigned"} className="space-y-2">
                  {isRenamingThis && (
                    <FloorRenameStrip
                      oldFloor={floor as string}
                      onSave={(next) => void renameFloor(floor as string, next)}
                      onCancel={() => setRenamingFloor(null)}
                    />
                  )}
                  <CollapsibleSection
                    title={`${floor ?? "Unassigned"} — ${floorDoors.length} ${
                      floorDoors.length === 1 ? "door" : "doors"
                    }${total ? ` · ${done}/${total}` : ""}`}
                    storageKey={`hd:job:${initialJob.id}:floor:${floor ?? "_unassigned"}`}
                    rightHeader={
                      canRename && !isRenamingThis ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFloor(floor);
                          }}
                          aria-label={`Rename floor ${floor}`}
                          className="h-8 rounded-md border border-neutral-300 px-2 text-[11px] font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
                        >
                          Rename
                        </button>
                      ) : undefined
                    }
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
                </div>
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
              const nextName = `Panel ${panels.length + 1}`;
              const { data, error } = await withTrack(saveTracker, async () => {
                const supabase = createClient();
                return supabase
                  .from("job_panels")
                  .insert({
                    job_id: job.id,
                    name: nextName,
                    position: panels.length,
                  })
                  .select("*")
                  .single();
              });
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
                allAssignedDoorIds={allAssignedDoorIds}
                onCreateAndAddDoors={(names) =>
                  createDoorsForPanel(panel.id, names)
                }
                photos={panelPhotos
                  .filter((p) => p.panel_id === panel.id)
                  .sort(
                    (a, b) =>
                      a.position - b.position ||
                      a.created_at.localeCompare(b.created_at),
                  )}
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
                  setPanelPhotos((current) =>
                    current.filter((p) => p.panel_id !== id),
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
                onPanelPhotoAdded={(photo) =>
                  setPanelPhotos((current) => [...current, photo])
                }
                onPanelPhotoDeleted={(id) =>
                  setPanelPhotos((current) =>
                    current.filter((p) => p.id !== id),
                  )
                }
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
          extras={extraSiteMaps}
          onExtraAdded={(map) =>
            setExtraSiteMaps((cur) => [...cur, map])
          }
          onExtraRemoved={(id) =>
            setExtraSiteMaps((cur) => cur.filter((m) => m.id !== id))
          }
          onExtraRenamed={(map) =>
            setExtraSiteMaps((cur) =>
              cur.map((m) => (m.id === map.id ? map : m)),
            )
          }
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
        <Field label="Job number" required>
          <input
            className={inputClass}
            value={headerDraft.number}
            onChange={(e) =>
              setHeaderDraft((d) => ({ ...d, number: e.target.value }))
            }
            required
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
        <div className="pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Worked on
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            Auto-fills from anyone who edits this job. Add helpers
            without accounts below.
          </p>
          <div className="mt-2">
            <WorkedOnSection
              job={job}
              derivedWorkers={initialDerivedWorkers}
              memberSuggestions={initialMemberSuggestions}
              onJobUpdate={(j) => setJob(j)}
            />
          </div>
        </div>
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

      <button
        type="button"
        onClick={async () => {
          const nextCompleted = job.completed_at
            ? null
            : new Date().toISOString();
          const { data, error } = await withTrack(saveTracker, async () => {
            const supabase = createClient();
            return supabase
              .from("jobs")
              .update({ completed_at: nextCompleted })
              .eq("id", job.id)
              .select("*")
              .maybeSingle();
          });
          if (error || !data) {
            alert(error?.message ?? "Couldn't update — refresh to sync.");
            return;
          }
          setJob(data as Job);
        }}
        className={
          "flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition active:scale-[0.98] " +
          (job.completed_at
            ? "border border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "bg-emerald-600 text-white dark:bg-emerald-500")
        }
      >
        {job.completed_at ? (
          <>
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed — tap to reopen
          </>
        ) : (
          <>Mark job complete</>
        )}
      </button>

      <div className="pt-1 text-center">
        <a
          href={`/jobs/${job.id}/history`}
          className="text-sm font-medium text-neutral-500 underline underline-offset-4 active:text-neutral-900 dark:text-neutral-400 dark:active:text-neutral-100"
        >
          View history
        </a>
      </div>

      {canDeleteJob && (
        <DeleteJobSection jobId={job.id} jobName={job.name} />
      )}

      <SaveStatusBar pending={pendingSaves > 0} flash={savedFlash} />

      {createTemplateOpen && (
        <CreateTemplateModal
          onClose={() => setCreateTemplateOpen(false)}
          onSaved={(template) => {
            setDbTemplates((cur) => {
              const without = cur.filter((t) => t.id !== template.id);
              return [...without, template].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
            });
            pickTemplate(template.id);
            setCreateTemplateOpen(false);
          }}
        />
      )}
    </main>
    </SaveTrackerContext.Provider>
  );
}

function SaveStatusBar({
  pending,
  flash,
}: {
  pending: boolean;
  flash: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-1/2 z-30 -translate-x-1/2 print:hidden"
    >
      <div
        className={
          "flex h-10 items-center gap-2 rounded-full border bg-white/95 px-4 text-xs font-medium shadow-md backdrop-blur transition-colors dark:bg-neutral-900/95 " +
          (pending
            ? "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            : flash
              ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
              : "border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400")
        }
      >
        {pending ? (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeOpacity="0.25"
              />
              <path
                d="M22 12a10 10 0 0 0-10-10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Saving…
          </>
        ) : flash ? (
          <>
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved
          </>
        ) : (
          <>
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            All saved
          </>
        )}
      </div>
    </div>
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

function FloorRenameStrip({
  oldFloor,
  onSave,
  onCancel,
}: {
  oldFloor: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(oldFloor);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/40">
      <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-amber-800 sm:inline dark:text-amber-200">
        Rename &ldquo;{oldFloor}&rdquo;
      </span>
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
      <button
        type="button"
        onClick={() => onSave(draft)}
        className="h-9 flex-shrink-0 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-9 flex-shrink-0 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
      >
        Cancel
      </button>
    </div>
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
      {/* Header row is a div, not a button — putting rightHeader's
          interactive children (Rename button, AddDoorMenu, etc.)
          inside another <button> is invalid HTML and breaks clicks
          on the inner controls in most browsers. The toggle is now
          a sibling of rightHeader instead of its parent. */}
      <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          className="-mx-2 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left active:bg-neutral-100 dark:active:bg-neutral-800"
          aria-expanded={open}
        >
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
        </button>
        {rightHeader && <div className="flex-shrink-0">{rightHeader}</div>}
      </div>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium">
        <span>
          {label}
          {required && (
            <span className="text-red-600 dark:text-red-400"> *</span>
          )}
        </span>
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
  template,
  onAdded,
}: {
  jobId: string;
  existingCount: number;
  template: DoorTemplate;
  onAdded: (
    door: JobDoor,
    items: JobDoorItem[],
    options?: { focus?: boolean },
  ) => void;
}) {
  const tracker = useContext(SaveTrackerContext);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  // Floor value that gets stamped on every door created from this
  // menu — persists across bulk/single/back-and-forth so the user
  // can type it once and then add as many doors as they want.
  const [floorDraft, setFloorDraft] = useState("");
  const [pending, setPending] = useState(false);

  async function createOne(
    name: string,
    position: number,
    focus: boolean,
  ): Promise<boolean> {
    return withTrack(tracker, async () => {
      const supabase = createClient();
      const floor = floorDraft.trim() || null;
      const { data: door, error } = await supabase
        .from("job_doors")
        .insert({ job_id: jobId, name, position, floor })
        .select("*")
        .single();
      if (error || !door) {
        alert(error?.message ?? "Couldn't add door.");
        return false;
      }
      const itemRows = template.items.map((n, idx) => ({
        door_id: door.id,
        name: n,
        position: idx,
      }));
      const { data: insertedItems, error: itemsError } = await supabase
        .from("job_door_items")
        .insert(itemRows)
        .select("*");
      if (itemsError) {
        alert(`Door added, but items failed: ${itemsError.message}`);
        onAdded(door as JobDoor, [], { focus });
      } else {
        onAdded(
          door as JobDoor,
          (insertedItems ?? []) as JobDoorItem[],
          { focus },
        );
      }
      return true;
    });
  }

  async function addSingle() {
    setPending(true);
    await createOne("", existingCount, true);
    setPending(false);
  }

  async function addBulk() {
    const names = bulkText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setPending(true);
    for (let i = 0; i < names.length; i++) {
      const ok = await createOne(names[i], existingCount + i, false);
      if (!ok) break;
    }
    setPending(false);
    setBulkText("");
    setBulkOpen(false);
  }

  // Floor input is the same compact field in both states — set once,
  // applies to every door added afterwards. Distinct id so the
  // browser stops grouping it with the AddDoorMenu in other doors.
  const floorInput = (
    <input
      type="text"
      placeholder="Floor"
      value={floorDraft}
      onChange={(e) => setFloorDraft(e.target.value)}
      id={`add-door-floor-${jobId}`}
      name={`add-door-floor-${jobId}`}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className="h-9 w-16 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    />
  );

  if (bulkOpen) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {floorInput}
        <input
          autoFocus
          type="text"
          placeholder="Door 101, Door 102…"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addBulk();
            }
            if (e.key === "Escape") {
              setBulkText("");
              setBulkOpen(false);
            }
          }}
          className="h-9 min-w-[10rem] flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button
          type="button"
          onClick={addBulk}
          disabled={pending || !bulkText.trim()}
          className="h-9 rounded-lg bg-neutral-900 px-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBulkOpen(false);
            setBulkText("");
          }}
          disabled={pending}
          aria-label="Cancel bulk add"
          className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 active:bg-neutral-100 dark:text-neutral-400 dark:active:bg-neutral-800"
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
    );
  }

  return (
    <div className="flex items-center gap-1">
      {floorInput}
      <button
        type="button"
        onClick={() => setBulkOpen(true)}
        disabled={pending}
        aria-label="Bulk add doors"
        className="h-9 rounded-md border border-neutral-300 px-2 text-[11px] font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
      >
        Bulk
      </button>
      <button
        type="button"
        onClick={addSingle}
        disabled={pending}
        className="h-9 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white transition active:scale-95 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Adding…" : "+ Door"}
      </button>
    </div>
  );
}

function TemplatePicker({
  templates,
  selectedId,
  onPick,
  onCreate,
  onDelete,
}: {
  templates: DoorTemplate[];
  selectedId: string;
  onPick: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected =
    templates.find((t) => t.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          selected
            ? `${selected.name} — ${selected.items.length} item${selected.items.length === 1 ? "" : "s"}`
            : "Template"
        }
        className="flex h-9 max-w-[8rem] items-center gap-1 rounded-md border border-neutral-300 px-2 text-[11px] font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
      >
        <svg
          className="h-3.5 w-3.5 flex-shrink-0"
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
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
        <span className="truncate">{selected?.name ?? "Template"}</span>
        <svg
          className="h-3 w-3 flex-shrink-0 text-neutral-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {templates.map((t) => {
              const isSel = t.id === selectedId;
              return (
                <li key={t.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(t.id);
                      setOpen(false);
                    }}
                    className={
                      "flex-1 truncate px-3 py-2 text-left text-xs " +
                      (isSel
                        ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                        : "text-neutral-700 dark:text-neutral-300")
                    }
                  >
                    {isSel && <span className="mr-1">✓</span>}
                    {t.name}
                    <span className="ml-1 text-neutral-400">
                      ({t.items.length})
                    </span>
                  </button>
                  {t.editable && (
                    <button
                      type="button"
                      onClick={() => onDelete(t.id)}
                      aria-label={`Delete template ${t.name}`}
                      className="flex h-8 w-8 items-center justify-center text-neutral-400 active:text-red-600"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-neutral-900 active:bg-neutral-100 dark:text-neutral-100 dark:active:bg-neutral-800"
            >
              <span className="text-base leading-none">+</span> Create
              template…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTemplateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (template: DoorTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  function updateItem(idx: number, value: string) {
    setItems((cur) => cur.map((v, i) => (i === idx ? value : v)));
  }
  function addItemRow() {
    setItems((cur) => [...cur, ""]);
  }
  function removeItemRow(idx: number) {
    setItems((cur) => (cur.length === 1 ? cur : cur.filter((_, i) => i !== idx)));
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("Give the template a name.");
      return;
    }
    const cleanItems = items.map((s) => s.trim()).filter(Boolean);
    if (cleanItems.length === 0) {
      alert("Add at least one item.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: tpl, error } = await supabase
      .from("job_templates")
      .insert({ name: trimmedName })
      .select("id, name")
      .single();
    if (error || !tpl) {
      setSaving(false);
      alert(`Couldn't save template: ${error?.message ?? "unknown error"}`);
      return;
    }
    const itemRows = cleanItems.map((n, i) => ({
      template_id: tpl.id,
      name: n,
      position: i,
    }));
    const { error: itemsError } = await supabase
      .from("job_template_items")
      .insert(itemRows);
    if (itemsError) {
      setSaving(false);
      alert(
        `Template created, but items failed to save: ${itemsError.message}`,
      );
      return;
    }
    setSaving(false);
    onSaved({
      id: tpl.id,
      name: tpl.name,
      items: cleanItems,
      editable: true,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-base font-semibold">New template</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
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
        <div className="space-y-3 px-4 py-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Card reader door"
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Items to pre-fill
            </label>
            <ul className="mt-1 space-y-1.5">
              {items.map((v, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={v}
                    onChange={(e) => updateItem(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (i === items.length - 1) addItemRow();
                      }
                    }}
                    placeholder={`Item ${i + 1}`}
                    className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                  />
                  <button
                    type="button"
                    onClick={() => removeItemRow(i)}
                    disabled={items.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 active:bg-neutral-100 disabled:opacity-30 dark:active:bg-neutral-800"
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
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addItemRow}
              className="mt-2 inline-flex h-8 items-center gap-1 rounded-md border border-neutral-300 px-2 text-xs font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
            >
              <span className="text-base leading-none">+</span> Add item
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-md px-3 text-xs font-medium text-neutral-700 active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 rounded-md bg-neutral-900 px-4 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DoorCardProps = {
  job: Job;
  door: JobDoor;
  items: JobDoorItem[];
  supabaseUrl: string;
  jobPhotos: JobPhoto[];
  itemPhotos: JobDoorItemPhoto[];
  onDoorUpdate: (door: JobDoor) => void;
  onDoorDelete: (id: string) => void;
  onItemsChange: (doorId: string, next: JobDoorItem[]) => void;
  onPhotoAdded: (photo: JobPhoto) => void;
  onPhotoDeleted: (id: string) => void;
  onItemPhotoAdded: (photo: JobDoorItemPhoto) => void;
  onItemPhotoDeleted: (id: string) => void;
  isNewlyAdded?: boolean;
  onFocusedNewlyAdded?: () => void;
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
  itemPhotos,
  onDoorUpdate,
  onDoorDelete,
  onItemsChange,
  onPhotoAdded,
  onPhotoDeleted,
  onItemPhotoAdded,
  onItemPhotoDeleted,
  isNewlyAdded,
  onFocusedNewlyAdded,
  dragHandle,
}: DoorCardProps & { dragHandle?: React.ReactNode }) {
  const expandKey = `hd:job:${job.id}:door:${door.id}`;
  const [expanded, setExpanded] = useState(!!isNewlyAdded);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // For newly added doors: scroll into view (just below the sticky
  // header) and focus the name input exactly once, then tell the parent
  // so it can reset the marker. scrollMarginTop keeps the door's name
  // row visible instead of tucked under the header. The latch is a ref
  // so we don't trigger a re-render from inside the effect.
  const didFocusRef = useRef(false);
  useEffect(() => {
    if (!isNewlyAdded || didFocusRef.current) return;
    didFocusRef.current = true;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
      onFocusedNewlyAdded?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isNewlyAdded, onFocusedNewlyAdded]);
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

  const tracker = useContext(SaveTrackerContext);

  async function commitField(patch: Partial<JobDoor>) {
    // maybeSingle (not single) so a missing row doesn't reject with
    // PostgREST's "JSON object requested, multiple (or no) rows
    // returned" — the user reported seeing that raw error when
    // saving a door name. If the row legitimately isn't there (deleted
    // in another tab, RLS edge case), tell them in plain English.
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_doors")
        .update(patch)
        .eq("id", door.id)
        .select("*")
        .maybeSingle();
    });
    if (error) {
      alert(`Couldn't save door: ${error.message}`);
      return;
    }
    if (!data) {
      alert(
        "Couldn't save door — it may have been deleted from another tab. Refresh to sync.",
      );
      return;
    }
    onDoorUpdate(data as JobDoor);
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteDoor() {
    setDeleting(true);
    const result = await withTrack(tracker, () => deleteDoorAction(door.id));
    setDeleting(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      alert(`Couldn't delete: ${result.error}`);
      return;
    }
    onDoorDelete(door.id);
  }

  async function toggleTested() {
    const next = door.tested_at ? null : new Date().toISOString();
    await commitField({ tested_at: next });
  }

  async function addItem(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const position = items.length;
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_door_items")
        .insert({ door_id: door.id, name: trimmed, position })
        .select("*")
        .single();
    });
    if (error || !data) {
      alert(error?.message ?? "Couldn't add item.");
      return;
    }
    onItemsChange(door.id, [...items, data as JobDoorItem]);
  }

  const itemSoftDelete = useSoftDelete<JobDoorItem>({
    delete: async (item) => {
      const result = await withTrack(tracker, () =>
        deleteDoorItemAction(item.id),
      );
      return result;
    },
    restore: async (snapshot) => {
      const result = await withTrack(tracker, () =>
        restoreDoorItemAction({
          door_id: snapshot.door_id,
          name: snapshot.name,
          note: snapshot.note,
          position: snapshot.position,
          completed_at: snapshot.completed_at,
          photo_storage_path: snapshot.photo_storage_path,
          photo_uploaded_at: snapshot.photo_uploaded_at,
        }),
      );
      if (!result.ok) return { ok: false, error: result.error };
      const restored: JobDoorItem = {
        ...snapshot,
        id: result.itemId,
        created_at: new Date().toISOString(),
      };
      return { ok: true, restored };
    },
    // Use latest items closure via the parent setter — onItemsChange
    // replaces the whole list for the door, so we read the current
    // items via the prop each call.
    onOptimisticRemove: (id) =>
      onItemsChange(
        door.id,
        items.filter((it) => it.id !== id),
      ),
    onRestore: (item) => onItemsChange(door.id, [...items, item]),
  });

  function requestRemoveItem(id: string) {
    // The X next to an item is small; one tap arms, the same X turns
    // into a Confirm pill. Mirrors the photo X flow.
    if (itemSoftDelete.confirmingId === id) {
      const target = items.find((it) => it.id === id);
      if (target) void itemSoftDelete.confirm(target);
    } else {
      itemSoftDelete.arm(id);
    }
  }

  const usedNames = new Set(items.map((it) => it.name));
  const quickAdds = [
    ...HUGS_TEMPLATE.requiredItems,
    ...HUGS_TEMPLATE.optionalItems,
    "Door contact",
    "REX",
  ].filter((n) => REPEATABLE_ITEMS.has(n) || !usedNames.has(n));

  const completedCount = items.filter((it) => it.completed_at).length;

  return (
    <div
      ref={rootRef}
      style={{ scrollMarginTop: "100px" }}
      className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
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
          ref={nameInputRef}
          // Per-row id (and matching name) so iOS Safari treats each
          // input as its own form field. Without these, a column of
          // identical "Door name" inputs registers as one repeating
          // autofill row and the OS misroutes typed characters /
          // Enter taps into a sibling — the "text jumps to the
          // previous box after ~8 entries" report.
          id={`door-name-${door.id}`}
          name={`door-name-${door.id}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
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
          onKeyDown={(e) => {
            // Explicit Enter handler — blur commits via the handler
            // above. Without this, Enter has no defined behavior on
            // a free-standing input and iOS will pick one (often
            // landing focus on a sibling).
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleTested();
          }}
          aria-pressed={!!door.tested_at}
          aria-label={door.tested_at ? "Mark not tested" : "Mark tested"}
          title={door.tested_at ? "Tested — tap to clear" : "Tap to mark tested"}
          className={
            "flex h-8 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold uppercase transition " +
            (door.tested_at
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-neutral-300 bg-white text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400")
          }
        >
          <span
            className={
              "flex h-4 w-4 items-center justify-center rounded border " +
              (door.tested_at
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-neutral-400 bg-white dark:border-neutral-500 dark:bg-neutral-900")
            }
          >
            {door.tested_at && (
              <svg
                className="h-3 w-3"
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
          </span>
          Tested
        </button>
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
              id={`door-floor-${door.id}`}
              name={`door-floor-${door.id}`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="optional"
              value={floorDraft}
              onChange={(e) => setFloorDraft(e.target.value)}
              onBlur={() => {
                const next = floorDraft.trim() || null;
                if (next !== door.floor) commitField({ floor: next });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
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
                  photos={itemPhotos
                    .filter((p) => p.item_id === it.id)
                    .sort(
                      (a, b) =>
                        a.position - b.position ||
                        a.created_at.localeCompare(b.created_at),
                    )}
                  supabaseUrl={supabaseUrl}
                  onUpdate={(updated) =>
                    onItemsChange(
                      door.id,
                      items.map((x) => (x.id === updated.id ? updated : x)),
                    )
                  }
                  onRemove={() => requestRemoveItem(it.id)}
                  removeArmed={itemSoftDelete.confirmingId === it.id}
                  onPhotoAdded={onItemPhotoAdded}
                  onPhotoDeleted={onItemPhotoDeleted}
                />
              ))}
            </ul>
            {itemSoftDelete.recentlyDeleted && (
              <UndoBanner
                message={`Removed "${itemSoftDelete.recentlyDeleted.name}".`}
                onUndo={() => void itemSoftDelete.undo()}
              />
            )}

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
              id={`door-notes-${door.id}`}
              name={`door-notes-${door.id}`}
              autoComplete="off"
              autoCorrect="on"
              spellCheck
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

// Lightweight rendering for the synthetic "Miscellaneous" door that
// the auto-detect import uses for gateways and other unlabeled
// standalone equipment. Skipping the full DoorCard (drag handles,
// photo strips, item-detail rows, etc) keeps opening the section
// instant even with dozens of items, and avoids labelling it as a
// "door" in the UI when it isn't one.
function MiscellaneousSection({
  door,
  items,
  onItemsChange,
}: {
  door: JobDoor;
  items: JobDoorItem[];
  onItemsChange: (items: JobDoorItem[]) => void;
}) {
  const tracker = useContext(SaveTrackerContext);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Items get grouped by name so a "Gateway × 4" pile shows as a
  // single labelled group rather than four loose check rows.
  const groups = useMemo(() => {
    const map = new Map<string, JobDoorItem[]>();
    for (const it of items) {
      const key = it.name;
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [items]);

  async function toggleItem(item: JobDoorItem) {
    const nextCompletedAt = item.completed_at
      ? null
      : new Date().toISOString();
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_door_items")
        .update({ completed_at: nextCompletedAt })
        .eq("id", item.id)
        .select("*")
        .maybeSingle();
    });
    if (error || !data) {
      alert(error?.message ?? "Couldn't update item — refresh to sync.");
      return;
    }
    onItemsChange(items.map((it) => (it.id === item.id ? (data as JobDoorItem) : it)));
  }

  async function addItem(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const position = items.length;
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_door_items")
        .insert({ door_id: door.id, name: trimmed, position })
        .select("*")
        .single();
    });
    if (error || !data) {
      alert(error?.message ?? "Couldn't add item.");
      return;
    }
    onItemsChange([...items, data as JobDoorItem]);
    setNewName("");
    setAdding(false);
  }

  const itemSoftDelete = useSoftDelete<JobDoorItem>({
    delete: async (item) =>
      withTrack(tracker, () => deleteDoorItemAction(item.id)),
    restore: async (snapshot) => {
      const result = await withTrack(tracker, () =>
        restoreDoorItemAction({
          door_id: snapshot.door_id,
          name: snapshot.name,
          note: snapshot.note,
          position: snapshot.position,
          completed_at: snapshot.completed_at,
          photo_storage_path: snapshot.photo_storage_path,
          photo_uploaded_at: snapshot.photo_uploaded_at,
        }),
      );
      if (!result.ok) return { ok: false, error: result.error };
      const restored: JobDoorItem = {
        ...snapshot,
        id: result.itemId,
        created_at: new Date().toISOString(),
      };
      return { ok: true, restored };
    },
    onOptimisticRemove: (id) =>
      onItemsChange(items.filter((it) => it.id !== id)),
    onRestore: (item) => onItemsChange([...items, item]),
  });

  function requestRemoveItem(itemId: string) {
    if (itemSoftDelete.confirmingId === itemId) {
      const target = items.find((it) => it.id === itemId);
      if (target) void itemSoftDelete.confirm(target);
    } else {
      itemSoftDelete.arm(itemId);
    }
  }

  return (
    <div className="space-y-3">
      {groups.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No miscellaneous equipment yet.
        </p>
      )}

      {groups.map(([name, groupItems]) => {
        const done = groupItems.filter((it) => it.completed_at).length;
        return (
          <div
            key={name}
            className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{name}</h3>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (done === groupItems.length
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
                }
              >
                {done}/{groupItems.length}
              </span>
            </div>
            <ul className="space-y-1">
              {groupItems.map((it, idx) => {
                const isDone = !!it.completed_at;
                return (
                  <li
                    key={it.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(it)}
                      aria-label={
                        isDone
                          ? `Mark ${name} #${idx + 1} not done`
                          : `Mark ${name} #${idx + 1} done`
                      }
                      className={
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border " +
                        (isDone
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900")
                      }
                    >
                      {isDone && (
                        <svg
                          className="h-3 w-3"
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
                    <span
                      className={
                        "flex-1 " +
                        (isDone
                          ? "text-neutral-400 line-through dark:text-neutral-500"
                          : "")
                      }
                    >
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => requestRemoveItem(it.id)}
                      aria-label={
                        itemSoftDelete.confirmingId === it.id
                          ? `Confirm remove ${name} #${idx + 1}`
                          : `Remove ${name} #${idx + 1}`
                      }
                      className={
                        "flex items-center justify-center rounded transition " +
                        (itemSoftDelete.confirmingId === it.id
                          ? "h-7 gap-1 bg-red-600 px-2 text-[10px] font-semibold text-white shadow-md"
                          : "h-7 w-7 text-neutral-400 active:text-red-600 dark:active:text-red-400")
                      }
                    >
                      {itemSoftDelete.confirmingId === it.id ? (
                        <>
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          ?
                        </>
                      ) : (
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
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => addItem(name)}
              className="mt-2 h-8 w-full rounded-md border border-dashed border-neutral-300 text-xs font-medium text-neutral-600 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
            >
              + Another {name}
            </button>
          </div>
        );
      })}

      {itemSoftDelete.recentlyDeleted && (
        <UndoBanner
          message={`Removed "${itemSoftDelete.recentlyDeleted.name}".`}
          onUndo={() => void itemSoftDelete.undo()}
        />
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addItem(newName);
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            type="text"
            placeholder="Category name (e.g. Gateways)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="h-10 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium dark:border-neutral-700"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          + New category
        </button>
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
  photos,
  supabaseUrl,
  onUpdate,
  onRemove,
  removeArmed,
  onPhotoAdded,
  onPhotoDeleted,
}: {
  job: Job;
  door: JobDoor;
  item: JobDoorItem;
  photos: JobDoorItemPhoto[];
  supabaseUrl: string;
  onUpdate: (item: JobDoorItem) => void;
  onRemove: () => void;
  // First tap arms; second tap actually removes. The parent owns
  // both the arm-state timer and the undo banner — this row just
  // renders the toggle visually.
  removeArmed: boolean;
  onPhotoAdded: (photo: JobDoorItemPhoto) => void;
  onPhotoDeleted: (id: string) => void;
}) {
  const tracker = useContext(SaveTrackerContext);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [syncedNote, setSyncedNote] = useState(item.note ?? "");
  const [uploading, setUploading] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  // Soft-delete photos with confirm-then-undo. Storage stays;
  // restoreDoorItemPhoto re-inserts pointing at the same path.
  const photoSoftDelete = useSoftDelete<JobDoorItemPhoto>({
    delete: (photo) =>
      withTrack(tracker, async () => {
        const supabase = createClient();
        return deleteDoorItemPhoto(supabase, photo);
      }),
    restore: async (snapshot) => {
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return restoreDoorItemPhoto(supabase, snapshot);
      });
      return result.ok
        ? { ok: true, restored: result.photo }
        : { ok: false, error: result.error };
    },
    onOptimisticRemove: (id) => onPhotoDeleted(id),
    onRestore: (photo) => onPhotoAdded(photo),
  });

  if ((item.note ?? "") !== syncedNote) {
    if (noteDraft === syncedNote) setNoteDraft(item.note ?? "");
    setSyncedNote(item.note ?? "");
  }

  async function saveNote(next: string | null) {
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_door_items")
        .update({ note: next })
        .eq("id", item.id)
        .select("*")
        .maybeSingle();
    });
    if (error || !data) {
      alert(error?.message ?? "Couldn't save note — refresh to sync.");
      return;
    }
    onUpdate(data as JobDoorItem);
  }

  async function uploadPhotos(files: FileList | File[]) {
    setUploading(true);
    const list = Array.from(files);
    // Serial upload — keeps the position counter monotonic and avoids
    // hammering the bucket with parallel writes. Per-file errors
    // bubble up via alert but don't stop the rest of the batch.
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return uploadDoorItemPhoto({
          supabase,
          file,
          jobId: job.id,
          doorId: door.id,
          itemId: item.id,
          nextPosition: photos.length + i,
        });
      });
      if (!result.ok) {
        alert(`${file.name}: ${result.error}`);
        continue;
      }
      onPhotoAdded(result.photo);
    }
    if (photoInput.current) photoInput.current.value = "";
    setUploading(false);
  }


  async function toggleComplete() {
    const nextCompletedAt = item.completed_at ? null : new Date().toISOString();
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_door_items")
        .update({ completed_at: nextCompletedAt })
        .eq("id", item.id)
        .select("*")
        .maybeSingle();
    });
    if (error || !data) {
      alert(error?.message ?? "Couldn't update item — refresh to sync.");
      return;
    }
    onUpdate(data as JobDoorItem);
  }

  const isDone = !!item.completed_at;
  const hasNote = !!item.note;
  const hasPhotos = photos.length > 0;

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
        {hasPhotos && (
          <div className="flex flex-shrink-0 -space-x-1">
            {photos.slice(0, 3).map((p) => (
              <a
                key={p.id}
                href={publicJobFileUrl(supabaseUrl, p.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${item.name} photo`}
                className="block h-8 w-8 overflow-hidden rounded border border-white bg-white dark:border-neutral-800 dark:bg-neutral-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
            {photos.length > 3 && (
              <span className="flex h-8 w-8 items-center justify-center rounded border border-white bg-neutral-200 text-[10px] font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-700 dark:text-neutral-200">
                +{photos.length - 3}
              </span>
            )}
          </div>
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
          aria-label={
            actionsOpen
              ? `Hide actions for ${item.name}`
              : `Show actions for ${item.name}`
          }
          aria-expanded={actionsOpen}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-500 active:bg-neutral-100 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          {/* Chevron that rotates open instead of a static + — the +
              didn't change to a − when the actions panel opened so it
              read like an 'add' affordance. Same iconography as the
              door / floor / section collapsibles. */}
          <svg
            className={
              "h-4 w-4 transition-transform " +
              (actionsOpen ? "rotate-90" : "")
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
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={
            removeArmed ? `Confirm remove ${item.name}` : `Remove ${item.name}`
          }
          className={
            "flex items-center justify-center rounded transition " +
            (removeArmed
              ? "h-8 gap-1 bg-red-600 px-2 text-[10px] font-semibold text-white shadow-md"
              : "h-8 w-8 text-neutral-400 active:text-red-600 dark:active:text-red-400")
          }
        >
          {removeArmed ? (
            <>
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Remove?
            </>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
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
        <>
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
              }}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {uploading ? "Uploading..." : "+ Photo"}
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
          </div>
          {hasPhotos && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="group relative aspect-square overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
                >
                  <a
                    href={publicJobFileUrl(supabaseUrl, p.storage_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicJobFileUrl(supabaseUrl, p.storage_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </a>
                  <PhotoDeleteToggle
                    photoId={p.id}
                    armed={photoSoftDelete.confirmingId === p.id}
                    onArm={() => photoSoftDelete.arm(p.id)}
                    onConfirm={() => void photoSoftDelete.confirm(p)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void uploadPhotos(e.target.files);
          }
        }}
      />

      {photoSoftDelete.recentlyDeleted && (
        <UndoBanner
          message="Photo deleted."
          onUndo={() => void photoSoftDelete.undo()}
        />
      )}
    </li>
  );
}

// Two-state X button used by every photo grid. Default state is the
// small black X in the corner; armed state is a red 'Delete?' pill
// that needs a second tap to actually confirm. Lives at the top of
// the file so the four photo flows (item / door / job / panel) can
// share it without duplicating SVG.
function PhotoDeleteToggle({
  photoId,
  armed,
  onArm,
  onConfirm,
}: {
  photoId: string;
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  if (armed) {
    return (
      <button
        type="button"
        onClick={onConfirm}
        aria-label={`Confirm delete photo ${photoId}`}
        className="absolute right-0.5 top-0.5 flex h-7 items-center gap-1 rounded-full bg-red-600 px-2 text-[10px] font-semibold text-white shadow-md"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Delete?
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onArm}
      aria-label="Delete photo"
      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
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
  const tracker = useContext(SaveTrackerContext);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    fileInput.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let firstError: string | null = null;
    for (const file of Array.from(files)) {
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return uploadJobPhoto({ supabase, file, jobId, doorId });
      });
      if (!result.ok) {
        if (!firstError) firstError = `${file.name}: ${result.error}`;
        continue;
      }
      onAdded(result.photo);
    }
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    if (firstError) setError(firstError);
  }

  const softDelete = useSoftDelete<JobPhoto>({
    delete: (photo) =>
      withTrack(tracker, async () => {
        const supabase = createClient();
        return deleteJobPhoto(supabase, photo);
      }),
    restore: async (snapshot) => {
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return restoreJobPhoto(supabase, snapshot);
      });
      return result.ok
        ? { ok: true, restored: result.photo }
        : { ok: false, error: result.error };
    },
    onOptimisticRemove: (id) => onDeleted(id),
    onRestore: (photo) => onAdded(photo),
  });

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
              <PhotoDeleteToggle
                photoId={p.id}
                armed={softDelete.confirmingId === p.id}
                onArm={() => softDelete.arm(p.id)}
                onConfirm={() => void softDelete.confirm(p)}
              />
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
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
      {softDelete.recentlyDeleted && (
        <UndoBanner
          message="Photo deleted."
          onUndo={() => void softDelete.undo()}
        />
      )}
    </div>
  );
}

function PanelCard({
  panel,
  jobId,
  allDoors,
  panelDoorIds,
  allAssignedDoorIds,
  photos,
  supabaseUrl,
  onPanelUpdate,
  onPanelDelete,
  onPanelDoorsChange,
  onPanelPhotoAdded,
  onPanelPhotoDeleted,
  onCreateAndAddDoors,
}: {
  panel: JobPanel;
  jobId: string;
  allDoors: JobDoor[];
  panelDoorIds: string[];
  allAssignedDoorIds: Set<string>;
  photos: JobPanelPhoto[];
  supabaseUrl: string;
  onPanelUpdate: (panel: JobPanel) => void;
  onPanelDelete: (id: string) => void;
  onPanelDoorsChange: (panelId: string, doorIds: string[]) => void;
  onPanelPhotoAdded: (photo: JobPanelPhoto) => void;
  onPanelPhotoDeleted: (id: string) => void;
  onCreateAndAddDoors: (names: string[]) => Promise<boolean>;
}) {
  const tracker = useContext(SaveTrackerContext);
  const [nameDraft, setNameDraft] = useState(panel.name);
  const [commDraft, setCommDraft] = useState(panel.comm_room ?? "");
  const [syncedName, setSyncedName] = useState(panel.name);
  const [syncedComm, setSyncedComm] = useState(panel.comm_room ?? "");
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickingDoor, setPickingDoor] = useState(false);
  const [newDoorBulk, setNewDoorBulk] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
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
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_panels")
        .update(patch)
        .eq("id", panel.id)
        .select("*")
        .maybeSingle();
    });
    if (error || !data) {
      alert(
        error?.message ??
          "Couldn't save panel — it may have been deleted. Refresh to sync.",
      );
      return;
    }
    onPanelUpdate(data as JobPanel);
  }

  async function deletePanel() {
    setDeleting(true);
    const { data, error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_panels")
        .delete()
        .eq("id", panel.id)
        .select("id");
    });
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
    const next = [...panelDoorIds, doorId];
    const { error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_panel_doors")
        .insert({
          panel_id: panel.id,
          door_id: doorId,
          position: next.length - 1,
        });
    });
    if (error) {
      alert(error.message);
      return;
    }
    onPanelDoorsChange(panel.id, next);
  }

  async function removeDoor(doorId: string) {
    const { error } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("job_panel_doors")
        .delete()
        .eq("panel_id", panel.id)
        .eq("door_id", doorId);
    });
    if (error) {
      alert(error.message);
      return;
    }
    onPanelDoorsChange(
      panel.id,
      panelDoorIds.filter((id) => id !== doorId),
    );
  }

  async function createNewDoors() {
    const names = newDoorBulk
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setCreatingNew(true);
    const ok = await onCreateAndAddDoors(names);
    setCreatingNew(false);
    if (ok) {
      setNewDoorBulk("");
    }
  }

  async function uploadPhotos(files: FileList | File[]) {
    setUploading(true);
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return uploadPanelPhoto({
          supabase,
          file,
          jobId,
          panelId: panel.id,
          nextPosition: photos.length + i,
        });
      });
      if (!result.ok) {
        alert(`${file.name}: ${result.error}`);
        continue;
      }
      onPanelPhotoAdded(result.photo);
    }
    if (photoInput.current) photoInput.current.value = "";
    setUploading(false);
  }

  const photoSoftDelete = useSoftDelete<JobPanelPhoto>({
    delete: (photo) =>
      withTrack(tracker, async () => {
        const supabase = createClient();
        return deletePanelPhoto(supabase, photo);
      }),
    restore: async (snapshot) => {
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return restorePanelPhoto(supabase, snapshot);
      });
      return result.ok
        ? { ok: true, restored: result.photo }
        : { ok: false, error: result.error };
    },
    onOptimisticRemove: (id) => onPanelPhotoDeleted(id),
    onRestore: (photo) => onPanelPhotoAdded(photo),
  });

  const doorMap = new Map(allDoors.map((d) => [d.id, d]));
  const linkedDoors = panelDoorIds
    .map((id) => doorMap.get(id))
    .filter((d): d is JobDoor => !!d);
  // Only show doors that aren't already linked to ANY panel. Doors
  // attached to other panels are hidden so the user doesn't accidentally
  // wire the same door to two panels.
  const availableDoors = allDoors.filter(
    (d) => !allAssignedDoorIds.has(d.id),
  );

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
          {!pickingDoor && (
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
                {availableDoors.length > 0
                  ? "Tap to assign or type new names"
                  : "Type new door names"}
              </span>
              <button
                type="button"
                onClick={() => setPickingDoor(false)}
                className="text-[11px] text-neutral-500 dark:text-neutral-400"
              >
                Close
              </button>
            </div>
            {availableDoors.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
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
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="New: Door 101, Door 102…"
                value={newDoorBulk}
                onChange={(e) => setNewDoorBulk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createNewDoors();
                  }
                }}
                disabled={creatingNew}
                className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={createNewDoors}
                disabled={creatingNew || !newDoorBulk.trim()}
                className="h-9 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {creatingNew ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Photos ({photos.length})
        </h4>
        {photos.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-1.5">
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
                    alt={`${panel.name} photo`}
                    className="h-full w-full object-cover"
                  />
                </a>
                <PhotoDeleteToggle
                  photoId={p.id}
                  armed={photoSoftDelete.confirmingId === p.id}
                  onArm={() => photoSoftDelete.arm(p.id)}
                  onConfirm={() => void photoSoftDelete.confirm(p)}
                />
              </div>
            ))}
          </div>
        )}
        {photoSoftDelete.recentlyDeleted && (
          <UndoBanner
            message="Photo deleted."
            onUndo={() => void photoSoftDelete.undo()}
          />
        )}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void uploadPhotos(e.target.files);
            }
          }}
        />
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          disabled={uploading}
          className="h-10 w-full rounded-lg border border-dashed border-neutral-300 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
        >
          {uploading ? "Uploading..." : "+ Add photo"}
        </button>
      </div>

    </li>
  );
}

function SiteMapBody({
  job,
  onJobUpdate,
  supabaseUrl,
  onOpenAutoDetect,
  extras,
  onExtraAdded,
  onExtraRemoved,
  onExtraRenamed,
}: {
  job: Job;
  onJobUpdate: (job: Job) => void;
  supabaseUrl: string;
  onOpenAutoDetect: () => void;
  extras: JobSiteMap[];
  onExtraAdded: (map: JobSiteMap) => void;
  onExtraRemoved: (id: string) => void;
  onExtraRenamed: (map: JobSiteMap) => void;
}) {
  const tracker = useContext(SaveTrackerContext);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Holds the storage path of whichever PDF the user opened
  // fullscreen, or null when the modal is closed.
  const [fullscreenSrc, setFullscreenSrc] = useState<string | null>(null);
  // External link (OneDrive / Google Drive / Dropbox / etc) for the
  // case where the PDF is too large to upload. Editable draft +
  // synced value pattern so the input doesn't fight realtime updates.
  const [urlDraft, setUrlDraft] = useState(job.site_map_url ?? "");
  const [syncedUrl, setSyncedUrl] = useState(job.site_map_url ?? "");
  if ((job.site_map_url ?? "") !== syncedUrl) {
    if (urlDraft === syncedUrl) setUrlDraft(job.site_map_url ?? "");
    setSyncedUrl(job.site_map_url ?? "");
  }

  // Combine the primary map and the extras into one list. The primary
  // is the one bound to the annotation editor; everything else is
  // view-only. Using a synthetic id "__primary" so the dropdown's
  // value attribute can survive primary uploads with new storage_paths.
  type ActivePdf = {
    key: string;
    label: string;
    storagePath: string;
    isPrimary: boolean;
  };
  const allPdfs = useMemo<ActivePdf[]>(() => {
    const list: ActivePdf[] = [];
    if (job.site_map_path) {
      list.push({
        key: "__primary",
        // Primary takes its label from jobs.site_map_label, falling
        // back to a hint about its editor role so the dropdown row
        // still reads as something.
        label: job.site_map_label?.trim() || "Primary (annotatable)",
        storagePath: job.site_map_path,
        isPrimary: true,
      });
    }
    for (const m of extras) {
      list.push({
        key: m.id,
        label: m.label?.trim() || "Untitled PDF",
        storagePath: m.storage_path,
        isPrimary: false,
      });
    }
    return list;
  }, [job.site_map_path, job.site_map_label, extras]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Resolve the active PDF — fall back to the first one if the saved
  // selection went away (e.g. an extra got deleted).
  const selected =
    allPdfs.find((p) => p.key === selectedKey) ?? allPdfs[0] ?? null;
  const selectedExtra = selected?.isPrimary
    ? null
    : extras.find((m) => m.id === selected?.key) ?? null;
  // The "renameable target": either the primary (label lives on
  // jobs.site_map_label) or an extra (label lives on job_site_maps.label).
  // Used to drive the same input for both cases.
  const renameTargetId = selected?.isPrimary ? "__primary" : selectedExtra?.id ?? null;
  const renameTargetCurrentLabel = selected?.isPrimary
    ? job.site_map_label ?? ""
    : selectedExtra?.label ?? "";

  // Editable label for the selected PDF. Synced-draft pattern so the
  // input doesn't fight realtime updates from another tab.
  const [labelDraft, setLabelDraft] = useState(renameTargetCurrentLabel);
  const [labelSyncId, setLabelSyncId] = useState<string | null>(
    renameTargetId,
  );
  if (renameTargetId !== labelSyncId) {
    setLabelSyncId(renameTargetId);
    setLabelDraft(renameTargetCurrentLabel);
  }

  async function commitLabel() {
    if (!selected) return;
    const next = labelDraft.trim() || null;
    if (selected.isPrimary) {
      if (next === (job.site_map_label ?? null)) return;
      const { data, error: dbError } = await withTrack(tracker, async () => {
        const supabase = createClient();
        return supabase
          .from("jobs")
          .update({ site_map_label: next })
          .eq("id", job.id)
          .select("*")
          .maybeSingle();
      });
      if (dbError || !data) {
        setError(dbError?.message ?? "Couldn't rename.");
        return;
      }
      onJobUpdate(data as Job);
      return;
    }
    if (!selectedExtra) return;
    if (next === (selectedExtra.label ?? null)) return;
    const result = await withTrack(tracker, async () => {
      const supabase = createClient();
      return renameExtraSiteMap(supabase, selectedExtra.id, next);
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onExtraRenamed(result.siteMap);
  }

  async function commitUrl(value: string | null) {
    const { data, error: dbError } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("jobs")
        .update({ site_map_url: value })
        .eq("id", job.id)
        .select("*")
        .maybeSingle();
    });
    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't save link.");
      return;
    }
    onJobUpdate(data as Job);
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    // First upload becomes the primary so the editor has something to
    // anchor to. Subsequent uploads go straight to extras and never
    // overwrite the primary by surprise.
    if (!job.site_map_path) {
      const supabase = createClient();
      const result = await uploadSiteMap({
        supabase,
        file,
        jobId: job.id,
        oldStoragePath: null,
      });
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
      setSelectedKey("__primary");
      return;
    }
    // Has primary already — anything else becomes an extra.
    const result = await withTrack(tracker, async () => {
      const supabase = createClient();
      return uploadExtraSiteMap({
        supabase,
        file,
        jobId: job.id,
        nextPosition: extras.length,
      });
    });
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onExtraAdded(result.siteMap);
    setSelectedKey(result.siteMap.id);
  }

  async function replaceSelected() {
    fileInput.current?.click();
  }

  async function replacePrimary(e: React.ChangeEvent<HTMLInputElement>) {
    // Used by the Replace button when the primary is the active map —
    // bypasses the "becomes an extra" branch in onChange by feeding a
    // dedicated input.
    const file = e.target.files?.[0];
    if (replaceInput.current) replaceInput.current.value = "";
    if (!file || !job.site_map_path) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const result = await uploadSiteMap({
      supabase,
      file,
      jobId: job.id,
      oldStoragePath: job.site_map_path,
    });
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

  // Two-tap + undo for extras. The primary still goes through the
  // legacy confirm() since restoring a primary properly would mean
  // reviving the jobs.site_map_path link, which is one-of and
  // tightly coupled to the annotation editor.
  const extraSoftDelete = useSoftDelete<JobSiteMap>({
    delete: (siteMap) =>
      withTrack(tracker, async () => {
        const supabase = createClient();
        return deleteExtraSiteMap(supabase, siteMap);
      }),
    restore: async (snapshot) => {
      const result = await withTrack(tracker, async () => {
        const supabase = createClient();
        return restoreExtraSiteMap(supabase, snapshot);
      });
      return result.ok
        ? { ok: true, restored: result.siteMap }
        : { ok: false, error: result.error };
    },
    onOptimisticRemove: (id) => onExtraRemoved(id),
    onRestore: (siteMap) => onExtraAdded(siteMap),
    undoTtlMs: 10000,
  });

  async function removeSelected() {
    if (!selected) return;
    if (selected.isPrimary) {
      if (!confirm("Remove the primary site map?")) return;
      const supabase = createClient();
      const result = await deleteSiteMap(
        supabase,
        job.id,
        selected.storagePath,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onJobUpdate({
        ...job,
        site_map_path: null,
        site_map_uploaded_at: null,
      });
      setSelectedKey(null);
      return;
    }
    if (!selectedExtra) return;
    // Two-tap on the visible Remove button: first tap arms, second
    // tap confirms.
    if (extraSoftDelete.confirmingId === selectedExtra.id) {
      await extraSoftDelete.confirm(selectedExtra);
      setSelectedKey(null);
    } else {
      extraSoftDelete.arm(selectedExtra.id);
    }
  }

  const replaceInput = useRef<HTMLInputElement>(null);

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {allPdfs.length === 0 ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="h-12 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          {uploading ? "Uploading..." : "+ Upload site map PDF"}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="active-pdf-select">
              Active PDF
            </label>
            <div className="relative flex-1">
              <select
                id="active-pdf-select"
                value={selected?.key ?? ""}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="block h-10 w-full appearance-none rounded-lg border border-neutral-300 bg-white pl-3 pr-8 text-sm font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
              >
                {allPdfs.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {allPdfs.length} {allPdfs.length === 1 ? "PDF" : "PDFs"}
            </span>
          </div>

          {selected && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Name
              </span>
              <input
                type="text"
                id={`pdf-label-${renameTargetId ?? "none"}`}
                name={`pdf-label-${renameTargetId ?? "none"}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                placeholder={
                  selected.isPrimary
                    ? "e.g. Floor 1 plan (leave blank to keep default)"
                    : "e.g. Riser diagram, Floor 2 plan"
                }
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => void commitLabel()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="block h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
              />
            </label>
          )}

          {selected && (
            <>
              <object
                key={selected.storagePath}
                data={
                  publicJobFileUrl(supabaseUrl, selected.storagePath) +
                  "#view=FitH"
                }
                type="application/pdf"
                className="h-[65vh] w-full rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950"
                aria-label={`Site map: ${selected.label}`}
              >
                <a
                  href={publicJobFileUrl(supabaseUrl, selected.storagePath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-neutral-600 dark:text-neutral-400"
                >
                  Your browser can&apos;t render PDFs inline. Tap to open.
                </a>
              </object>
              <button
                type="button"
                onClick={() => setFullscreenSrc(selected.storagePath)}
                className="block w-full text-center text-[11px] font-medium text-neutral-500 underline-offset-2 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
              >
                Open fullscreen
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    if (selected.isPrimary) replaceInput.current?.click();
                    else void replaceSelected();
                  }}
                  className="h-10 flex-1 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  {uploading
                    ? "Uploading..."
                    : selected.isPrimary
                      ? "Replace PDF"
                      : "Add new PDF"}
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className={
                    "h-10 rounded-lg px-3 text-sm font-medium transition " +
                    (selectedExtra &&
                    extraSoftDelete.confirmingId === selectedExtra.id
                      ? "bg-red-600 text-white shadow-md"
                      : "border border-red-300 text-red-600 dark:border-red-900 dark:text-red-400")
                  }
                >
                  {selectedExtra &&
                  extraSoftDelete.confirmingId === selectedExtra.id
                    ? "Confirm?"
                    : "Remove"}
                </button>
              </div>
              {selected.isPrimary && (
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
              )}
              {!selected.isPrimary && (
                <p className="text-center text-[11px] italic text-neutral-500 dark:text-neutral-400">
                  Annotation editor is scoped to the primary PDF.
                </p>
              )}
            </>
          )}

          {/* Always-visible "Add another PDF" handle so multi-map jobs
              don't have to switch views to add a third sheet. */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="h-10 w-full rounded-lg border border-dashed border-neutral-300 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
          >
            {uploading ? "Uploading..." : "+ Add another PDF"}
          </button>
        </div>
      )}

      <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            External link
          </span>
          <span className="mb-2 block text-[11px] text-neutral-500 dark:text-neutral-400">
            For maps too large to upload. Paste a OneDrive / Google
            Drive / Dropbox share link — opens in a new tab.
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => {
              const next = urlDraft.trim() || null;
              if (next !== job.site_map_url) void commitUrl(next);
            }}
            className="block h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </label>
        {job.site_map_url && (
          <a
            href={job.site_map_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex h-9 items-center justify-center gap-1 rounded-md bg-neutral-900 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open link
          </a>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onChange}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={replacePrimary}
      />

      {extraSoftDelete.recentlyDeleted && (
        <UndoBanner
          message={`Removed PDF "${
            extraSoftDelete.recentlyDeleted.label?.trim() || "Untitled"
          }".`}
          onUndo={() => void extraSoftDelete.undo()}
        />
      )}

      {fullscreenSrc && (
        <PdfFullscreenModal
          src={publicJobFileUrl(supabaseUrl, fullscreenSrc)}
          label={
            allPdfs.find((p) => p.storagePath === fullscreenSrc)?.label ??
            "Site map"
          }
          onClose={() => setFullscreenSrc(null)}
        />
      )}
    </>
  );
}

function WorkedOnSection({
  job,
  derivedWorkers,
  memberSuggestions,
  onJobUpdate,
}: {
  job: Job;
  derivedWorkers: string[];
  memberSuggestions: string[];
  onJobUpdate: (job: Job) => void;
}) {
  const tracker = useContext(SaveTrackerContext);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manual = job.manual_workers ?? [];
  // Suppress a derived entry when the same person is also in the
  // manual list (case-insensitive on the email local-part vs the
  // typed name) so we don't list "Mark" twice for someone who got
  // re-added by hand.
  const manualLower = new Set(manual.map((n) => n.trim().toLowerCase()));
  const visibleDerived = derivedWorkers.filter((email) => {
    const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
    return !manualLower.has(local) && !manualLower.has(email.toLowerCase());
  });

  async function commitWorkers(next: string[]) {
    setPending(true);
    setError(null);
    const { data, error: dbError } = await withTrack(tracker, async () => {
      const supabase = createClient();
      return supabase
        .from("jobs")
        .update({ manual_workers: next })
        .eq("id", job.id)
        .select("*")
        .maybeSingle();
    });
    setPending(false);
    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't save.");
      return;
    }
    onJobUpdate(data as Job);
  }

  async function addWorker() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (manual.some((n) => n.trim().toLowerCase() === lower)) {
      setError(`${trimmed} is already on the list.`);
      return;
    }
    await commitWorkers([...manual, trimmed]);
    setNewName("");
    setAdding(false);
  }

  // Two-tap + undo for manual workers. The "snapshot" the soft-delete
  // hook needs has an id, so wrap each name in a synthetic { id, name }
  // pair keyed by the name itself (manual_workers dedupes by string).
  type WorkerSnapshot = { id: string; name: string; index: number };
  const workerSoftDelete = useSoftDelete<WorkerSnapshot>({
    delete: async (snapshot) => {
      const supabase = createClient();
      const { error } = await withTrack(tracker, async () =>
        supabase
          .from("jobs")
          .update({
            manual_workers: manual.filter((n) => n !== snapshot.name),
          })
          .eq("id", job.id),
      );
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    restore: async (snapshot) => {
      const supabase = createClient();
      const { data, error } = await withTrack(tracker, async () =>
        supabase
          .from("jobs")
          .update({
            manual_workers: [
              ...manual.slice(0, snapshot.index),
              snapshot.name,
              ...manual.slice(snapshot.index),
            ],
          })
          .eq("id", job.id)
          .select("*")
          .single(),
      );
      if (error || !data) {
        return { ok: false, error: error?.message ?? "Couldn't restore." };
      }
      onJobUpdate(data as Job);
      return { ok: true, restored: snapshot };
    },
    // Reading parent state via job + onJobUpdate; the synthetic id
    // makes the hook's contract happy without persisting it.
    onOptimisticRemove: () => {
      // No-op — the delete path already updates jobs.manual_workers
      // via Supabase, which arrives back through the realtime job
      // UPDATE subscription. Nothing extra to do client-side here.
    },
    onRestore: () => {
      // Same — restore writes through jobs and the row update fans
      // back via realtime.
    },
  });

  function requestRemoveWorker(name: string) {
    const id = `worker:${name}`;
    if (workerSoftDelete.confirmingId === id) {
      const index = manual.indexOf(name);
      void workerSoftDelete.confirm({ id, name, index });
    } else {
      workerSoftDelete.arm(id);
    }
  }

  if (
    visibleDerived.length === 0 &&
    manual.length === 0 &&
    !adding
  ) {
    return (
      <div className="space-y-2">
        <p className="text-xs italic text-neutral-500 dark:text-neutral-400">
          Whoever edits this job will appear here automatically. Add
          helpers who don&apos;t have accounts with the button below.
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 w-full rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          + Add a name
        </button>
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {visibleDerived.map((email) => (
          <li
            key={`derived:${email}`}
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {firstNameFromEmail(email).slice(0, 2)}
            </span>
            <span className="flex-1 truncate text-sm font-medium">
              {firstNameFromEmail(email)}
            </span>
            <span
              className="text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
              title="Picked up from the job activity log"
            >
              from activity
            </span>
          </li>
        ))}
        {manual.map((name) => (
          <li
            key={`manual:${name}`}
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {name.trim().slice(0, 2)}
            </span>
            <span className="flex-1 truncate text-sm font-medium">{name}</span>
            <button
              type="button"
              onClick={() => requestRemoveWorker(name)}
              disabled={pending}
              aria-label={
                workerSoftDelete.confirmingId === `worker:${name}`
                  ? `Confirm remove ${name}`
                  : `Remove ${name}`
              }
              className={
                "flex flex-shrink-0 items-center justify-center rounded transition disabled:opacity-50 " +
                (workerSoftDelete.confirmingId === `worker:${name}`
                  ? "h-7 gap-1 bg-red-600 px-2 text-[10px] font-semibold text-white shadow-md"
                  : "h-7 w-7 text-neutral-400 active:text-red-600 dark:active:text-red-400")
              }
            >
              {workerSoftDelete.confirmingId === `worker:${name}` ? (
                <>
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  ?
                </>
              ) : (
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>

      {workerSoftDelete.recentlyDeleted && (
        <UndoBanner
          message={`Removed "${workerSoftDelete.recentlyDeleted.name}".`}
          onUndo={() => void workerSoftDelete.undo()}
        />
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addWorker();
          }}
          className="flex gap-2"
        >
          <MemberCombo
            value={newName}
            onChange={setNewName}
            suggestions={memberSuggestions.filter((s) => {
              const lower = s.toLowerCase();
              if (manualLower.has(lower)) return false;
              return !visibleDerived.some(
                (e) =>
                  firstNameFromEmail(e).toLowerCase() === lower ||
                  e.toLowerCase() === lower,
              );
            })}
          />
          <button
            type="submit"
            disabled={pending || !newName.trim()}
            className="h-10 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError(null);
            }}
            disabled={pending}
            className="h-10 rounded-md border border-neutral-300 px-3 text-xs font-medium dark:border-neutral-700"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-9 w-full rounded-md border border-dashed border-neutral-300 text-xs font-medium text-neutral-600 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
        >
          + Add a name
        </button>
      )}

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// Inline combo input for the Worked-on add row. Unlike the shared
// Combobox, it stays closed on focus — the user has to either start
// typing (autocomplete) or tap the chevron (full member list). The
// chevron sits inside the input so the visible field width matches
// a normal text input. Tapping a suggestion fills the value; the
// outer form's Add button still commits.
function MemberCombo({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return suggestions.slice(0, 50);
    return suggestions
      .filter((s) => s.toLowerCase().includes(trimmed))
      .slice(0, 50);
  }, [value, suggestions]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        placeholder="Name"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Open as soon as the user starts typing — but only if the
          // field actually has content. Otherwise typing then erasing
          // would leave the full list hovering open uninvited.
          setOpen(e.target.value.length > 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
        className="block h-10 w-full rounded-md border border-neutral-300 bg-white pl-3 pr-9 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close member list" : "Open member list"}
        aria-expanded={open}
        className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-neutral-400 active:text-neutral-700 dark:active:text-neutral-200"
      >
        <svg
          className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {filtered.map((s) => (
            <li key={s} role="option">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="block w-full px-3 py-2 text-left text-sm transition active:bg-neutral-100 hover:bg-neutral-100 dark:active:bg-neutral-800 dark:hover:bg-neutral-800"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteJobAction(jobId);
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }
      // replace, not push — the current /jobs/[id] URL is now a 404
      // and we don't want it sitting in the back stack. Skipping
      // router.refresh() too: replacing routes already runs a fresh
      // server render of /jobs, and pairing it with refresh() was
      // racing the navigation (the refresh would re-render the
      // current page's server component, hit notFound() on the
      // deleted row, and the resulting transition stalled — which is
      // why the button visibly stuck on "Deleting…").
      router.replace("/jobs");
      // Belt-and-suspenders: if for any reason the route transition
      // doesn't unmount us within a moment, drop pending so the
      // button isn't permanently stuck.
      window.setTimeout(() => setPending(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
      setPending(false);
    }
  }

  if (confirming) {
    return (
      <section className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
        <p className="text-sm text-red-900 dark:text-red-100">
          Delete <strong>{jobName}</strong>? This removes every door,
          item, photo, panel, and the site map.
        </p>
        {error && (
          <p className="rounded bg-white/70 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={pending}
            className="h-10 flex-1 rounded-lg border border-neutral-300 bg-white text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-10 flex-1 rounded-lg bg-red-600 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Deleting..." : "Yes, delete"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-12 w-full rounded-lg border border-red-300 text-sm font-medium text-red-600 transition active:bg-red-50 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
      >
        Delete job
      </button>
    </section>
  );
}
