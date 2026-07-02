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
import type { JobPhoto, JobSiteMap } from "@/lib/job-photos";
import { isAdminEmail } from "@/lib/admin";
import { firstNameFromEmail } from "@/lib/email";

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

  // Three batches, each as parallel as the data dependencies allow:
  //   1. Everything keyed by job id alone.
  //   2. Everything that needs door / panel ids from batch 1.
  //   3. Item photos, which need item ids from batch 2.
  const [
    { data: job, error },
    { data: doors, error: doorsError },
    { data: photos, error: photosError },
    { data: panels },
    { data: extraSiteMaps },
    { data: activityEmails },
    { data: fleetActivityEmails },
    { data: jobsWithManualWorkers },
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
    supabase
      .from("job_site_maps")
      .select("*")
      .eq("job_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    // Every email that touched this job in any way. Distinct() isn't
    // available on the JS client; the dedupe + sort happens in JS
    // below. The full activity log is small per-job (one row per
    // edit) so pulling the column is cheap.
    supabase
      .from("job_activity")
      .select("user_email, created_at")
      .eq("job_id", id)
      .not("user_email", "is", null)
      .order("created_at", { ascending: true }),
    // Fleet-wide cast of every emailed contributor across all jobs.
    // Powers the Worked-on suggestion dropdown. Pulling a single
    // column without filtering is still small (one row per edit
    // total); a few thousand rows is fine to dedupe in JS.
    supabase
      .from("job_activity")
      .select("user_email")
      .not("user_email", "is", null)
      .limit(2000),
    // Fleet-wide manual_workers names — anyone the team has typed
    // in by hand on any job. We flatten the text[] in JS.
    supabase
      .from("jobs")
      .select("manual_workers")
      .not("manual_workers", "is", null)
      .limit(2000),
  ]);

  // Derived "worked on" — first-seen-first order so the original
  // author leads the list. Lowercased for dedupe; we keep the
  // first-seen casing for display via firstNameFromEmail downstream.
  const derivedWorkers: string[] = [];
  {
    const seen = new Set<string>();
    for (const row of activityEmails ?? []) {
      const email = (row.user_email as string | null)?.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      derivedWorkers.push(email);
    }
  }

  // Fleet-wide "member" pool for the Worked-on add-name combo. Two
  // streams: every email that's ever appeared in a job_activity row
  // (which we convert to first names so the dropdown shows people,
  // not emails) and every manually-typed name across all jobs. We
  // dedupe by lowercase, keep the first-seen casing, and sort
  // alphabetically for a steady alphabetized dropdown.
  const memberSuggestions: string[] = [];
  {
    const seen = new Set<string>();
    const pushUnique = (raw: string) => {
      const name = raw.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      memberSuggestions.push(name);
    };
    for (const row of fleetActivityEmails ?? []) {
      const email = (row.user_email as string | null)?.trim();
      if (email) pushUnique(firstNameFromEmail(email));
    }
    for (const row of jobsWithManualWorkers ?? []) {
      const list = row.manual_workers as string[] | null;
      for (const name of list ?? []) pushUnique(name);
    }
    memberSuggestions.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  if (error || !job) notFound();

  const doorIds = (doors ?? []).map((d) => d.id);
  const panelIds = (panels ?? []).map((p) => p.id);

  const [
    { data: items, error: itemsError },
    { data: panelDoors },
    { data: panelPhotos },
  ] = await Promise.all([
    doorIds.length === 0
      ? Promise.resolve({ data: [] as JobDoorItem[], error: null })
      : supabase
          .from("job_door_items")
          .select(
            "id, door_id, name, note, ip_address, mac_address, photo_storage_path, photo_uploaded_at, completed_at, position, created_at",
          )
          .in("door_id", doorIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
    panelIds.length === 0
      ? Promise.resolve({ data: [] as JobPanelDoor[] })
      : supabase.from("job_panel_doors").select("*").in("panel_id", panelIds),
    panelIds.length === 0
      ? Promise.resolve({ data: [] as JobPanelPhoto[] })
      : supabase
          .from("job_panel_photos")
          .select("*")
          .in("panel_id", panelIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
  ]);

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
        initialExtraSiteMaps={(extraSiteMaps ?? []) as JobSiteMap[]}
        initialDerivedWorkers={derivedWorkers}
        initialMemberSuggestions={memberSuggestions}
        doorsLoadError={doorsError?.message ?? null}
        itemsLoadError={itemsError?.message ?? null}
        photosLoadError={photosError?.message ?? null}
        canDeleteJob={isAdmin}
      />
    </>
  );
}
