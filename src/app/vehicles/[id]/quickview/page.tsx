import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicPhotoUrl, type VehiclePhoto } from "@/lib/vehicle-photos";

type QuickViewItem = {
  id: string;
  category: "hardware" | "tool";
  name: string;
  quantity_text: string;
};

type QuickViewIssue = {
  id: string;
  body: string;
};

export default async function VehicleQuickViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: vehicle, error: vehicleError },
    { data: itemsData },
    { data: issuesData },
    { data: photosData },
  ] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", id).single(),
    supabase
      .from("vehicle_items")
      .select("id, category, name, quantity_text, display_order")
      .eq("vehicle_id", id)
      .order("category", { ascending: true })
      .order("display_order", { ascending: true }),
    supabase
      .from("vehicle_issues")
      .select("id, body, resolved_at")
      .eq("vehicle_id", id)
      .is("resolved_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_photos")
      .select("*")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (vehicleError || !vehicle) notFound();

  const items = (itemsData ?? []) as QuickViewItem[];
  const issues = (issuesData ?? []) as QuickViewIssue[];
  const photos = (photosData ?? []) as VehiclePhoto[];
  const hardware = items.filter((i) => i.category === "hardware");
  const tools = items.filter((i) => i.category === "tool");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href={`/vehicles/${vehicle.id}`}
          aria-label="Back"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full active:bg-neutral-200/60 dark:active:bg-neutral-800/60"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Quick view
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {vehicle.name}
          </h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
        <VehicleMetaBlock
          location={vehicle.location_label}
          lastJob={vehicle.last_worked_job}
          make={vehicle.make}
          model={vehicle.model}
          year={vehicle.year}
          licensePlate={vehicle.license_plate}
        />

        <CategoryBlock
          title="Hardware"
          items={hardware}
          emptyText="No hardware listed."
        />
        <CategoryBlock
          title="Tools"
          items={tools}
          emptyText="No tools listed."
        />

        {issues.length > 0 && (
          <div>
            <SectionHeading
              label={`Open issues (${issues.length})`}
              tone="warning"
            />
            <ul className="space-y-1 text-sm">
              {issues.map((issue) => (
                <li
                  key={issue.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  {issue.body}
                </li>
              ))}
            </ul>
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <SectionHeading label={`Photos (${photos.length})`} />
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo) => {
                const url = publicPhotoUrl(supabaseUrl, photo.storage_path);
                return (
                  <li
                    key={photo.id}
                    className="aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={photo.caption ?? ""}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function VehicleMetaBlock({
  location,
  lastJob,
  make,
  model,
  year,
  licensePlate,
}: {
  location: string | null;
  lastJob: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  licensePlate: string | null;
}) {
  const detail = [make, model, year ? String(year) : null]
    .filter(Boolean)
    .join(" ");
  const rows: { label: string; value: string }[] = [];
  if (location) rows.push({ label: "Location", value: location });
  if (lastJob) rows.push({ label: "Last job", value: lastJob });
  if (detail) rows.push({ label: "Vehicle", value: detail });
  if (licensePlate) rows.push({ label: "Plate", value: licensePlate });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No vehicle info set.
      </p>
    );
  }

  return (
    <dl className="overflow-hidden rounded-lg border border-neutral-200 text-sm dark:border-neutral-800">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-3 px-4 py-3 ${
            i > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""
          }`}
        >
          <dt className="text-neutral-500 dark:text-neutral-400">{row.label}</dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CategoryBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: QuickViewItem[];
  emptyText: string;
}) {
  return (
    <div>
      <SectionHeading label={`${title} (${items.length})`} />
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {emptyText}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-neutral-200 text-sm dark:border-neutral-800">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-baseline justify-between gap-3 px-4 py-2 ${
                i > 0
                  ? "border-t border-neutral-200 dark:border-neutral-800"
                  : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="flex-shrink-0 text-neutral-500 dark:text-neutral-400">
                {item.quantity_text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHeading({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : "text-neutral-500 dark:text-neutral-400";
  return (
    <h2
      className={`mb-2 text-xs font-semibold uppercase tracking-wide ${toneClass}`}
    >
      {label}
    </h2>
  );
}
