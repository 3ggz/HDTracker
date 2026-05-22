"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatGpsLocationLabel,
  isValidCoordinatePair,
  normalizeVehicleItemDrafts,
  trimToNullable,
  type VehicleItemDraft,
} from "@/lib/vehicle-detail-fields";
import type { VehicleItemSuggestions } from "@/lib/vehicle-suggestions";

const HARDWARE_NAMES_LIST_ID = "vehicle-hardware-names";
const TOOL_NAMES_LIST_ID = "vehicle-tool-names";
const QUANTITIES_LIST_ID = "vehicle-item-quantities";

type VehicleDetail = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  location_label: string | null;
  location_lat: number | null;
  location_lng: number | null;
  last_worked_job: string | null;
};

type VehicleItemCategory = "hardware" | "tool";

type VehicleItem = {
  id: string;
  category: VehicleItemCategory;
  name: string;
  quantity_text: string;
  display_order: number;
};

type ItemEditorDraft = VehicleItemDraft & {
  localId: string;
  category: VehicleItemCategory;
};

type VehicleIssue = {
  id: string;
  body: string;
  resolved_at: string | null;
  created_at: string;
};

type PendingAction = "save" | "gps" | "add-issue" | string;

const inputClass =
  "block min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

const buttonClass =
  "flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-60";

export function VehicleDetailClient({
  initialVehicle,
  initialItems,
  initialIssues,
  itemsLoadError,
  issuesLoadError,
  suggestions,
}: {
  initialVehicle: VehicleDetail;
  initialItems: VehicleItem[];
  initialIssues: VehicleIssue[];
  itemsLoadError: string | null;
  issuesLoadError: string | null;
  suggestions: VehicleItemSuggestions;
}) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [itemDrafts, setItemDrafts] = useState<ItemEditorDraft[]>(() =>
    initialItems.map(itemToDraft),
  );
  const [savedItemIds, setSavedItemIds] = useState(
    () => new Set(initialItems.map((item) => item.id)),
  );
  const [issues, setIssues] = useState(initialIssues);
  const [lastJob, setLastJob] = useState(vehicle.last_worked_job ?? "");
  const [manualLocation, setManualLocation] = useState(
    vehicle.location_label ?? "",
  );
  const [locationLat, setLocationLat] = useState(vehicle.location_lat);
  const [locationLng, setLocationLng] = useState(vehicle.location_lng);
  const [newIssue, setNewIssue] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(
    itemsLoadError ?? issuesLoadError,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const detailRows = useMemo(() => {
    const rows: { label: string; value: string | number }[] = [];
    if (vehicle.make) rows.push({ label: "Make", value: vehicle.make });
    if (vehicle.model) rows.push({ label: "Model", value: vehicle.model });
    if (vehicle.year) rows.push({ label: "Year", value: vehicle.year });
    if (vehicle.license_plate) {
      rows.push({ label: "Plate", value: vehicle.license_plate });
    }
    return rows;
  }, [vehicle]);

  const hardwareDrafts = itemDrafts.filter(
    (draft) => draft.category === "hardware",
  );
  const toolDrafts = itemDrafts.filter((draft) => draft.category === "tool");
  const openIssues = issues.filter((issue) => !issue.resolved_at);
  const resolvedIssues = issues.filter((issue) => issue.resolved_at);

  function markDirty() {
    setDirty(true);
    setNotice(null);
  }

  function addItem(category: VehicleItemCategory) {
    setItemDrafts((current) => [
      ...current,
      {
        localId: createLocalId(),
        category,
        name: "",
        quantity_text: "Has some",
      },
    ]);
    markDirty();
  }

  function updateItemDraft(
    localId: string,
    field: "name" | "quantity_text",
    value: string,
  ) {
    setItemDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId ? { ...draft, [field]: value } : draft,
      ),
    );
    markDirty();
  }

  function removeItem(localId: string) {
    setItemDrafts((current) =>
      current.filter((draft) => draft.localId !== localId),
    );
    markDirty();
  }

  function onLastJobChange(value: string) {
    setLastJob(value);
    markDirty();
  }

  function onManualLocationChange(value: string) {
    setManualLocation(value);
    setLocationLat(null);
    setLocationLng(null);
    markDirty();
  }

  function onUseGpsLocation() {
    setError(null);
    setNotice(null);

    if (!navigator.geolocation) {
      setError("This browser does not support location access.");
      return;
    }

    setPending("gps");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        if (!isValidCoordinatePair(latitude, longitude)) {
          setError("The browser returned an invalid location.");
          setPending(null);
          return;
        }

        setManualLocation(formatGpsLocationLabel(latitude, longitude));
        setLocationLat(latitude);
        setLocationLng(longitude);
        setPending(null);
        markDirty();
      },
      (geoError) => {
        setError(geoError.message || "Couldn't get your current location.");
        setPending(null);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  async function onSaveChanges() {
    setPending("save");
    setError(null);
    setNotice(null);

    const normalizedHardware = normalizeDraftsForCategory(
      itemDrafts,
      "hardware",
    );
    const normalizedTools = normalizeDraftsForCategory(itemDrafts, "tool");
    const nextItems = [...normalizedHardware, ...normalizedTools];
    const supabase = createClient();

    const { error: vehicleError } = await supabase
      .from("vehicles")
      .update({
        last_worked_job: trimToNullable(lastJob),
        location_label: trimToNullable(manualLocation),
        location_lat: locationLat,
        location_lng: locationLng,
      })
      .eq("id", vehicle.id);

    if (vehicleError) {
      setError(vehicleError.message);
      setPending(null);
      return;
    }

    const keptIds = new Set(
      nextItems.flatMap((item) => (item.id ? [item.id] : [])),
    );
    const deletedIds = [...savedItemIds].filter((id) => !keptIds.has(id));

    if (deletedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("vehicle_items")
        .delete()
        .in("id", deletedIds);

      if (deleteError) {
        setError(deleteError.message);
        setPending(null);
        return;
      }
    }

    for (const [displayOrder, item] of nextItems.entries()) {
      const payload = {
        vehicle_id: vehicle.id,
        category: item.category,
        name: item.name,
        quantity_text: item.quantity_text,
        display_order: displayOrder,
      };

      const { error: itemError } = item.id
        ? await supabase.from("vehicle_items").update(payload).eq("id", item.id)
        : await supabase.from("vehicle_items").insert(payload);

      if (itemError) {
        setError(itemError.message);
        setPending(null);
        return;
      }
    }

    const { data: refreshedItems, error: refreshError } = await supabase
      .from("vehicle_items")
      .select("id, category, name, quantity_text, display_order")
      .eq("vehicle_id", vehicle.id)
      .order("category", { ascending: true })
      .order("display_order", { ascending: true });

    if (refreshError) {
      setError(refreshError.message);
      setPending(null);
      return;
    }

    const savedItems = (refreshedItems ?? []) as VehicleItem[];
    setVehicle((current) => ({
      ...current,
      last_worked_job: trimToNullable(lastJob),
      location_label: trimToNullable(manualLocation),
      location_lat: locationLat,
      location_lng: locationLng,
    }));
    setItemDrafts(savedItems.map(itemToDraft));
    setSavedItemIds(new Set(savedItems.map((item) => item.id)));
    setDirty(false);
    setNotice("Changes saved.");
    setPending(null);
    router.refresh();
  }

  async function onAddIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = trimToNullable(newIssue);
    if (!body) {
      setError("Type the issue first.");
      return;
    }

    setPending("add-issue");
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("vehicle_issues")
      .insert({ vehicle_id: vehicle.id, body })
      .select("id, body, resolved_at, created_at")
      .single();

    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't save the issue.");
      setPending(null);
      return;
    }

    setIssues((current) => [data, ...current]);
    setNewIssue("");
    setNotice("Issue added.");
    setPending(null);
    router.refresh();
  }

  async function onToggleIssue(issue: VehicleIssue) {
    const nextResolvedAt = issue.resolved_at ? null : new Date().toISOString();
    setPending(issue.id);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("vehicle_issues")
      .update({ resolved_at: nextResolvedAt })
      .eq("id", issue.id)
      .select("id, body, resolved_at, created_at")
      .single();

    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't update the issue.");
      setPending(null);
      return;
    }

    setIssues((current) =>
      current.map((currentIssue) =>
        currentIssue.id === issue.id ? data : currentIssue,
      ),
    );
    setNotice(nextResolvedAt ? "Issue resolved." : "Issue reopened.");
    setPending(null);
    router.refresh();
  }

  return (
    <section className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">
      <SuggestionDatalists suggestions={suggestions} />
      <div className="space-y-3">
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {notice && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {notice}
          </p>
        )}

        <CollapsibleSection
          title="Hardware"
          meta={`${countNamedItems(hardwareDrafts)} items`}
          defaultOpen
        >
          <VehicleItemEditor
            category="hardware"
            addLabel="Add hardware"
            drafts={hardwareDrafts}
            namePlaceholder="Zip ties"
            quantityPlaceholder="1 box"
            nameListId={HARDWARE_NAMES_LIST_ID}
            quantityListId={QUANTITIES_LIST_ID}
            onAdd={addItem}
            onRemove={removeItem}
            onUpdate={updateItemDraft}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Tools"
          meta={`${countNamedItems(toolDrafts)} items`}
          defaultOpen
        >
          <VehicleItemEditor
            category="tool"
            addLabel="Add tool"
            drafts={toolDrafts}
            namePlaceholder="Hammer drill"
            quantityPlaceholder="1"
            nameListId={TOOL_NAMES_LIST_ID}
            quantityListId={QUANTITIES_LIST_ID}
            onAdd={addItem}
            onRemove={removeItem}
            onUpdate={updateItemDraft}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Vehicle details" meta={vehicle.name}>
          {detailRows.length > 0 ? (
            <dl className="overflow-hidden rounded-lg border border-neutral-200 text-sm dark:border-neutral-800">
              {detailRows.map((row, i) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i > 0
                      ? "border-t border-neutral-200 dark:border-neutral-800"
                      : ""
                  }`}
                >
                  <dt className="text-neutral-500 dark:text-neutral-400">
                    {row.label}
                  </dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No vehicle details saved.
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Location"
          meta={manualLocation || "Not set"}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={onUseGpsLocation}
              disabled={pending === "gps"}
              className={`${buttonClass} w-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900`}
            >
              {pending === "gps" ? "Getting location..." : "Use current location"}
            </button>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Manual location
              </span>
              <textarea
                value={manualLocation}
                onChange={(e) => onManualLocationChange(e.target.value)}
                rows={2}
                placeholder="Marriott parking lot, Tampa"
                className={inputClass}
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Last job" meta={lastJob || "Not set"}>
          <textarea
            value={lastJob}
            onChange={(e) => onLastJobChange(e.target.value)}
            rows={2}
            placeholder="Hotel access control, Tampa"
            className={inputClass}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Issues" meta={`${openIssues.length} open`}>
          <div className="space-y-4">
            <form onSubmit={onAddIssue} className="space-y-3">
              <textarea
                value={newIssue}
                onChange={(e) => setNewIssue(e.target.value)}
                rows={2}
                placeholder="AC compressor making noise"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={pending === "add-issue"}
                className={`${buttonClass} w-full border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50`}
              >
                {pending === "add-issue" ? "Adding..." : "Add issue"}
              </button>
            </form>

            <IssueList
              issues={openIssues}
              pending={pending}
              emptyText="No open issues"
              onToggleIssue={onToggleIssue}
            />

            {resolvedIssues.length > 0 && (
              <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <h3 className="mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  Resolved
                </h3>
                <IssueList
                  issues={resolvedIssues}
                  pending={pending}
                  emptyText=""
                  onToggleIssue={onToggleIssue}
                />
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={!dirty || pending === "save"}
            className={`${buttonClass} w-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900`}
          >
            {pending === "save" ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}

function VehicleItemEditor({
  category,
  addLabel,
  drafts,
  namePlaceholder,
  quantityPlaceholder,
  nameListId,
  quantityListId,
  onAdd,
  onRemove,
  onUpdate,
}: {
  category: VehicleItemCategory;
  addLabel: string;
  drafts: ItemEditorDraft[];
  namePlaceholder: string;
  quantityPlaceholder: string;
  nameListId: string;
  quantityListId: string;
  onAdd: (category: VehicleItemCategory) => void;
  onRemove: (localId: string) => void;
  onUpdate: (
    localId: string,
    field: "name" | "quantity_text",
    value: string,
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nothing listed yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li
              key={draft.localId}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <label className="block">
                  <span className="sr-only">Name</span>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      onUpdate(draft.localId, "name", e.target.value)
                    }
                    placeholder={namePlaceholder}
                    list={nameListId}
                    autoComplete="off"
                    autoCapitalize="words"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Quantity</span>
                  <input
                    value={draft.quantity_text}
                    onChange={(e) =>
                      onUpdate(draft.localId, "quantity_text", e.target.value)
                    }
                    placeholder={quantityPlaceholder}
                    list={quantityListId}
                    autoComplete="off"
                    className={inputClass}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => onRemove(draft.localId)}
                className="mt-2 min-h-10 rounded-lg px-2 text-sm font-medium text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onAdd(category)}
        className={`${buttonClass} w-full border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50`}
      >
        {addLabel}
      </button>
    </div>
  );
}

function SuggestionDatalists({
  suggestions,
}: {
  suggestions: VehicleItemSuggestions;
}) {
  return (
    <>
      <datalist id={HARDWARE_NAMES_LIST_ID}>
        {suggestions.hardwareNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id={TOOL_NAMES_LIST_ID}>
        {suggestions.toolNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id={QUANTITIES_LIST_ID}>
        {suggestions.quantities.map((quantity) => (
          <option key={quantity} value={quantity} />
        ))}
      </datalist>
    </>
  );
}

function CollapsibleSection({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-tight">
            {title}
          </span>
          {meta && (
            <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
              {meta}
            </span>
          )}
        </span>
        <span className="text-xl leading-none text-neutral-500">
          {open ? "-" : "+"}
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
          {children}
        </div>
      )}
    </section>
  );
}

function IssueList({
  issues,
  pending,
  emptyText,
  onToggleIssue,
}: {
  issues: VehicleIssue[];
  pending: PendingAction | null;
  emptyText: string;
  onToggleIssue: (issue: VehicleIssue) => void;
}) {
  if (issues.length === 0) {
    return emptyText ? (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {emptyText}
      </p>
    ) : null;
  }

  return (
    <ul className="space-y-2">
      {issues.map((issue) => {
        const resolved = Boolean(issue.resolved_at);
        return (
          <li
            key={issue.id}
            className="flex gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <p
              className={`min-w-0 flex-1 text-sm ${
                resolved
                  ? "text-neutral-400 line-through dark:text-neutral-500"
                  : "text-neutral-800 dark:text-neutral-100"
              }`}
            >
              {issue.body}
            </p>
            <button
              type="button"
              onClick={() => onToggleIssue(issue)}
              disabled={pending === issue.id}
              className="min-h-11 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 active:scale-[0.98] disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200"
            >
              {pending === issue.id
                ? "Saving"
                : resolved
                  ? "Reopen"
                  : "Resolve"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function normalizeDraftsForCategory(
  drafts: ItemEditorDraft[],
  category: VehicleItemCategory,
): (VehicleItemDraft & { category: VehicleItemCategory })[] {
  return normalizeVehicleItemDrafts(
    drafts
      .filter((draft) => draft.category === category)
      .map(({ id, name, quantity_text }) => ({ id, name, quantity_text })),
  ).map((draft) => ({ ...draft, category }));
}

function itemToDraft(item: VehicleItem): ItemEditorDraft {
  return {
    localId: item.id,
    id: item.id,
    category: item.category,
    name: item.name,
    quantity_text: item.quantity_text,
  };
}

function countNamedItems(drafts: ItemEditorDraft[]) {
  return drafts.filter((draft) => trimToNullable(draft.name)).length;
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
