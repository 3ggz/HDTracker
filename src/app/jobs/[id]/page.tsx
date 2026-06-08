import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobDetailClient } from "@/components/JobDetailClient";
import type {
  Job,
  JobDoor,
  JobDoorItem,
  JobDoorItemPhoto,
  JobPanel,
  JobPanelDoor,
  JobPanelPhoto,
} from "@/lib/jobs";
import type { JobPhoto } from "@/lib/job-photos";
import { isAdminEmail } from "@/lib/admin";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

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

  const itemIds = (items ?? []).map((it) => it.id);
  const { data: itemPhotos } =
    itemIds.length === 0
      ? { data: [] as JobDoorItemPhoto[] }
      : await supabase
          .from("job_door_item_photos")
          .select("*")
          .in("item_id", itemIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

  const { data: panelPhotos } =
    panelIds.length === 0
      ? { data: [] as JobPanelPhoto[] }
      : await supabase
          .from("job_panel_photos")
          .select("*")
          .in("panel_id", panelIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-50/80 px-3 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 print:hidden">
        <Link
          href="/jobs"
          aria-label="Back"
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full active:bg-neutral-200/60 dark:active:bg-neutral-800/60"
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
        {(job.site_map_path || job.site_map_url) &&
          (() => {
            // Prefer the in-app editor when there's an uploaded PDF
            // (annotation tools, page nav, the works). Fall back to
            // opening the external link when that's all we have.
            const isExternal = !job.site_map_path && !!job.site_map_url;
            const href = job.site_map_path
              ? `/jobs/${job.id}/map`
              : (job.site_map_url as string);
            return (
              <a
                href={href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                aria-label="View site map"
                className="flex h-8 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:active:bg-neutral-800"
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
                  <path d="M9 20l-5.4-2.7A2 2 0 0 1 2.5 15.5V5.2a1 1 0 0 1 1.5-.9L9 7" />
                  <path d="M9 7v13" />
                  <path d="M9 7l6-3 6 3" />
                  <path d="M21 4.2v10.3a2 2 0 0 1-1.1 1.8L15 19" />
                  <path d="M15 7v13" />
                </svg>
                Map
              </a>
            );
          })()}
        <Link
          href={`/jobs/${job.id}/quickview`}
          className="flex h-8 items-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          Quick view
        </Link>
        <Link
          href={`/jobs/${job.id}/print`}
          className="flex h-8 items-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:active:bg-neutral-800"
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
        initialItemPhotos={(itemPhotos ?? []) as JobDoorItemPhoto[]}
        initialPanelPhotos={(panelPhotos ?? []) as JobPanelPhoto[]}
        doorsLoadError={doorsError?.message ?? null}
        itemsLoadError={itemsError?.message ?? null}
        photosLoadError={photosError?.message ?? null}
        canDeleteJob={isAdmin}
      />
    </>
  );
}
