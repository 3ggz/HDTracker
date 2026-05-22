import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LiveUpdater } from "@/components/LiveUpdater";

type Vehicle = {
  id: string;
  name: string;
  location_label: string | null;
  last_worked_job: string | null;
};

type Item = {
  vehicle_id: string;
  category: "hardware" | "tool";
  name: string;
  quantity_text: string;
  display_order: number;
};

type Issue = {
  vehicle_id: string;
  body: string;
};

export default async function FleetQuickViewPage() {
  const supabase = await createClient();

  const [vehiclesRes, itemsRes, issuesRes] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, name, location_label, last_worked_job")
      .order("name", { ascending: true }),
    supabase
      .from("vehicle_items")
      .select("vehicle_id, category, name, quantity_text, display_order")
      .order("category", { ascending: true })
      .order("display_order", { ascending: true }),
    supabase
      .from("vehicle_issues")
      .select("vehicle_id, body, resolved_at")
      .is("resolved_at", null),
  ]);

  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const allItems = (itemsRes.data ?? []) as Item[];
  const openIssues = (issuesRes.data ?? []) as Issue[];

  const itemsByVehicle = new Map<string, Item[]>();
  for (const item of allItems) {
    const list = itemsByVehicle.get(item.vehicle_id) ?? [];
    list.push(item);
    itemsByVehicle.set(item.vehicle_id, list);
  }

  const issuesByVehicle = new Map<string, Issue[]>();
  for (const issue of openIssues) {
    const list = issuesByVehicle.get(issue.vehicle_id) ?? [];
    list.push(issue);
    issuesByVehicle.set(issue.vehicle_id, list);
  }

  return (
    <>
      <LiveUpdater channelName="qv-fleet-vehicles" table="vehicles" />
      <LiveUpdater channelName="qv-fleet-items" table="vehicle_items" />
      <LiveUpdater channelName="qv-fleet-issues" table="vehicle_issues" />
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href="/"
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
            Fleet
          </h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        {vehiclesRes.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load vehicles: {vehiclesRes.error.message}
          </p>
        )}

        {!vehiclesRes.error && vehicles.length === 0 && (
          <p className="mt-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No vehicles yet.
          </p>
        )}

        {vehicles.map((vehicle, vehicleIndex) => {
          const vItems = itemsByVehicle.get(vehicle.id) ?? [];
          const hardware = vItems.filter((i) => i.category === "hardware");
          const tools = vItems.filter((i) => i.category === "tool");
          const issues = issuesByVehicle.get(vehicle.id) ?? [];

          return (
            <article
              key={vehicle.id}
              className={`space-y-4 py-6 ${
                vehicleIndex > 0
                  ? "border-t border-neutral-200 dark:border-neutral-800"
                  : "pt-0"
              }`}
            >
              <div>
                <Link
                  href={`/vehicles/${vehicle.id}`}
                  className="text-lg font-semibold tracking-tight underline-offset-4 hover:underline"
                >
                  {vehicle.name}
                </Link>
                <div className="mt-1 space-y-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  {vehicle.location_label ? (
                    <p>Location: {vehicle.location_label}</p>
                  ) : (
                    <p className="italic">No location set</p>
                  )}
                  {vehicle.last_worked_job && (
                    <p>Last job: {vehicle.last_worked_job}</p>
                  )}
                </div>
              </div>

              <CategorySummary
                title="Hardware"
                items={hardware}
                emptyText="No hardware listed."
              />
              <CategorySummary
                title="Tools"
                items={tools}
                emptyText="No tools listed."
              />

              {issues.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Open issues ({issues.length})
                  </h3>
                  <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
                    {issues.map((issue, i) => (
                      <li key={i}>• {issue.body}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

function CategorySummary({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Item[];
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm italic text-neutral-400 dark:text-neutral-500">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3">
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
