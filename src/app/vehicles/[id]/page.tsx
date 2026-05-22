import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VehicleDetailClient } from "@/components/VehicleDetailClient";
import {
  buildVehicleItemSuggestions,
  type VehicleItemCategory,
} from "@/lib/vehicle-suggestions";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: vehicle, error },
    { data: items, error: itemsError },
    { data: issues, error: issuesError },
    { data: allItems },
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
      .select("id, body, resolved_at, created_at")
      .eq("vehicle_id", id)
      .order("resolved_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_items")
      .select("category, name, quantity_text"),
  ]);

  if (error || !vehicle) notFound();

  const suggestions = buildVehicleItemSuggestions(
    (allItems ?? []) as {
      category: VehicleItemCategory;
      name: string;
      quantity_text: string;
    }[],
  );

  return (
    <>
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
        <h1 className="truncate text-base font-semibold tracking-tight">
          {vehicle.name}
        </h1>
      </header>

      <VehicleDetailClient
        initialVehicle={vehicle}
        initialItems={items ?? []}
        initialIssues={issues ?? []}
        itemsLoadError={itemsError?.message ?? null}
        issuesLoadError={issuesError?.message ?? null}
        suggestions={suggestions}
      />
    </>
  );
}
