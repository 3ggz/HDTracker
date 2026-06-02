import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobDetailClient } from "@/components/JobDetailClient";
import type {
  Job,
  JobDoor,
  JobDoorItem,
  JobPanel,
  JobPanelDoor,
} from "@/lib/jobs";
import type { JobPhoto } from "@/lib/job-photos";

// Auto-detect calls Claude vision with xhigh effort on multi-page PDFs;
// allow up to 2 minutes so the server action doesn't time out at 10s/60s.
export const maxDuration = 120;

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: job, error },
    { data: doors, error: doorsError },
    { data: photos, error: photosError },
    { data: panels },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase
      .from("job_doors")
      .select("*")
      .eq("job_id", id)
      .order("floor", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_panels")
      .select("*")
      .eq("job_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (error || !job) notFound();

  const doorIds = (doors ?? []).map((d) => d.id);
  const { data: items, error: itemsError } =
    doorIds.length === 0
      ? { data: [] as JobDoorItem[], error: null }
      : await supabase
          .from("job_door_items")
          .select(
            "id, door_id, name, note, photo_storage_path, photo_uploaded_at, completed_at, position, created_at",
          )
          .in("door_id", doorIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

  const panelIds = (panels ?? []).map((p) => p.id);
  const { data: panelDoors } =
    panelIds.length === 0
      ? { data: [] as JobPanelDoor[] }
      : await supabase
          .from("job_panel_doors")
          .select("*")
          .in("panel_id", panelIds);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 print:hidden">
        <Link
          href="/jobs"
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
        <h1 className="truncate flex-1 text-base font-semibold tracking-tight">
          {job.name}
        </h1>
        <Link
          href={`/jobs/${job.id}/quickview`}
          className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
        >
          Quick view
        </Link>
        <Link
          href={`/jobs/${job.id}/print`}
          className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
        >
          PDF
        </Link>
      </header>

      <JobDetailClient
        initialJob={job as Job}
        initialDoors={(doors ?? []) as JobDoor[]}
        initialItems={(items ?? []) as JobDoorItem[]}
        initialPhotos={(photos ?? []) as JobPhoto[]}
        initialPanels={(panels ?? []) as JobPanel[]}
        initialPanelDoors={(panelDoors ?? []) as JobPanelDoor[]}
        doorsLoadError={doorsError?.message ?? null}
        itemsLoadError={itemsError?.message ?? null}
        photosLoadError={photosError?.message ?? null}
      />
    </>
  );
}
