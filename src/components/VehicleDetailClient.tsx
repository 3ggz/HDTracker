"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatGpsLocationLabel,
  isValidCoordinatePair,
  normalizeVehicleItemDrafts,
  parseQuantityPrefix,
  parseYearInput,
  subtractFromQuantity,
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

type PendingAction = "save" | "gps" | "add-issue" | "delete" | string;

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
  const [name, setName] = useState(vehicle.name);
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [yearInput, setYearInput] = useState(
    vehicle.year != null ? String(vehicle.year) : "",
  );
  const [licensePlate, setLicensePlate] = useState(vehicle.license_plate ?? "");
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ItemEditorDraft | null>(
    null,
  );

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
        quantity_text: "",
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

  function askRemoveItem(localId: string) {
    const draft = itemDrafts.find((d) => d.localId === localId);
    if (!draft) return;
    setRemoveTarget(draft);
  }

  function onConfirmRemoveAll() {
    if (!removeTarget) return;
    removeItem(removeTarget.localId);
    setRemoveTarget(null);
  }

  function onConfirmRemoveSome(amount: number) {
    if (!removeTarget) return;
    const result = subtractFromQuantity(removeTarget.quantity_text, amount);
    if (!result) return;
    if (result.kind === "remove-all") {
      removeItem(removeTarget.localId);
    } else {
      updateItemDraft(
        removeTarget.localId,
        "quantity_text",
        result.quantity_text,
      );
    }
    setRemoveTarget(null);
  }

  function onLastJobChange(value: string) {
    setLastJob(value);
    markDirty();
  }

  function onMetaFieldChange(setter: (value: string) => void, value: string) {
    setter(value);
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
    setError(null);
    setNotice(null);

    const nextName = name.trim();
    if (!nextName) {
      setError("Vehicle needs a name.");
      return;
    }

    setPending("save");

    const nextYear = parseYearInput(yearInput);
    const nextMake = trimToNullable(make);
    const nextModel = trimToNullable(model);
    const nextLicensePlate = trimToNullable(licensePlate);
    const nextLastJob = trimToNullable(lastJob);
    const nextLocationLabel = trimToNullable(manualLocation);

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
        name: nextName,
        make: nextMake,
        model: nextModel,
        year: nextYear,
        license_plate: nextLicensePlate,
        last_worked_job: nextLastJob,
        location_label: nextLocationLabel,
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
      name: nextName,
      make: nextMake,
      model: nextModel,
      year: nextYear,
      license_plate: nextLicensePlate,
      last_worked_job: nextLastJob,
      location_label: nextLocationLabel,
      location_lat: locationLat,
      location_lng: locationLng,
    }));
    setName(nextName);
    setMake(nextMake ?? "");
    setModel(nextModel ?? "");
    setYearInput(nextYear != null ? String(nextYear) : "");
    setLicensePlate(nextLicensePlate ?? "");
    setItemDrafts(savedItems.map(itemToDraft));
    setSavedItemIds(new Set(savedItems.map((item) => item.id)));
    setDirty(false);
    setNotice("Changes saved.");
    setPending(null);
    router.refresh();
  }

  async function onDeleteVehicle() {
    setPending("delete");
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", vehicle.id);

    if (dbError) {
      setError(dbError.message);
      setPending(null);
      setConfirmDelete(false);
      return;
    }

    router.replace("/");
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
      {removeTarget && (
        <RemoveItemModal
          target={removeTarget}
          onCancel={() => setRemoveTarget(null)}
          onRemoveAll={onConfirmRemoveAll}
          onRemoveSome={onConfirmRemoveSome}
        />
      )}
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
            namePlaceholder="Item"
            quantityPlaceholder="Qty"
            nameListId={HARDWARE_NAMES_LIST_ID}
            quantityListId={QUANTITIES_LIST_ID}
            onAdd={addItem}
            onAskRemove={askRemoveItem}
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
            namePlaceholder="Tool"
            quantityPlaceholder="Qty"
            nameListId={TOOL_NAMES_LIST_ID}
            quantityListId={QUANTITIES_LIST_ID}
            onAdd={addItem}
            onAskRemove={askRemoveItem}
            onUpdate={updateItemDraft}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Vehicle details" meta={name || vehicle.name}>
          <div className="space-y-3">
            <MetaField label="Name" required>
              <input
                value={name}
                onChange={(e) => onMetaFieldChange(setName, e.target.value)}
                className={inputClass}
              />
            </MetaField>
            <MetaField label="Make">
              <input
                value={make}
                onChange={(e) => onMetaFieldChange(setMake, e.target.value)}
                className={inputClass}
              />
            </MetaField>
            <MetaField label="Model">
              <input
                value={model}
                onChange={(e) => onMetaFieldChange(setModel, e.target.value)}
                className={inputClass}
              />
            </MetaField>
            <MetaField label="Year">
              <input
                value={yearInput}
                onChange={(e) =>
                  onMetaFieldChange(setYearInput, e.target.value)
                }
                inputMode="numeric"
                className={inputClass}
              />
            </MetaField>
            <MetaField label="License plate">
              <input
                value={licensePlate}
                onChange={(e) =>
                  onMetaFieldChange(setLicensePlate, e.target.value)
                }
                className={inputClass}
              />
            </MetaField>
          </div>
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

        <DeleteVehicleSection
          vehicleName={vehicle.name}
          confirming={confirmDelete}
          pending={pending === "delete"}
          onAskConfirm={() => {
            setConfirmDelete(true);
            setNotice(null);
            setError(null);
          }}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDeleteVehicle}
        />
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
  onAskRemove,
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
  onAskRemove: (localId: string) => void;
  onUpdate: (
    localId: string,
    field: "name" | "quantity_text",
    value: string,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nothing listed yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((draft) => (
            <li key={draft.localId} className="flex items-center gap-2">
              <label className="block flex-1 min-w-0">
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
              <label className="block w-24 flex-shrink-0">
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
              <button
                type="button"
                onClick={() => onAskRemove(draft.localId)}
                aria-label={`Remove ${draft.name || "item"}`}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-500 transition active:scale-95 active:bg-red-50 active:text-red-600 dark:text-neutral-400 dark:active:bg-red-950/40 dark:active:text-red-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="h-5 w-5"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
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

function RemoveItemModal({
  target,
  onCancel,
  onRemoveAll,
  onRemoveSome,
}: {
  target: ItemEditorDraft;
  onCancel: () => void;
  onRemoveAll: () => void;
  onRemoveSome: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const numericPrefix = parseQuantityPrefix(target.quantity_text);
  const parsedAmount = Number.parseFloat(amount);
  const canSubtract =
    numericPrefix !== null &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;
  const displayName = target.name.trim() || "this item";
  const displayQuantity = target.quantity_text.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-item-title"
      onClick={onCancel}
      className="fixed inset-0 z-30 flex items-end bg-black/50 px-4 pb-4 pt-20"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900"
      >
        <h2 id="remove-item-title" className="text-lg font-semibold">
          Remove {displayName}?
        </h2>
        {displayQuantity && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Currently: {displayQuantity}
          </p>
        )}

        {numericPrefix && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubtract) onRemoveSome(parsedAmount);
            }}
            className="mt-4 space-y-2"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                How many to remove?
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={numericPrefix.number}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={!canSubtract}
              className={`${buttonClass} w-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900`}
            >
              Remove {canSubtract ? parsedAmount : "some"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onRemoveAll}
          className={`${buttonClass} mt-3 w-full bg-red-600 text-white dark:bg-red-600`}
        >
          Remove all
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${buttonClass} mt-2 w-full text-neutral-600 dark:text-neutral-400`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function MetaField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-red-600 dark:text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}

function DeleteVehicleSection({
  vehicleName,
  confirming,
  pending,
  onAskConfirm,
  onCancel,
  onConfirm,
}: {
  vehicleName: string;
  confirming: boolean;
  pending: boolean;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 dark:border-red-950/60 dark:bg-neutral-900">
        <button
          type="button"
          onClick={onAskConfirm}
          className={`${buttonClass} w-full text-red-700 dark:text-red-400`}
        >
          Delete vehicle
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm text-red-800 dark:text-red-200">
        Permanently delete <strong>{vehicleName}</strong>? All its hardware,
        tools, and issues are removed too. This can&apos;t be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={`${buttonClass} flex-1 border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`${buttonClass} flex-1 bg-red-600 text-white dark:bg-red-600`}
        >
          {pending ? "Deleting..." : "Yes, delete"}
        </button>
      </div>
    </div>
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
