import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicJobFileUrl } from "@/lib/job-photos";

export default async function JobMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, name, site_map_path")
    .eq("id", id)
    .single();
  if (error || !job) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/95 px-3 py-2 backdrop-blur">
        <Link
          href={`/jobs/${job.id}`}
          aria-label="Back to job"
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 active:bg-neutral-800"
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
        <p className="truncate flex-1 text-sm font-medium text-neutral-100">
          {job.name} · Site map
        </p>
        {job.site_map_path && (
          <a
            href={publicJobFileUrl(supabaseUrl, job.site_map_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 active:bg-neutral-800"
          >
            Open in new tab
          </a>
        )}
      </header>
      <div className="relative flex-1 bg-neutral-100">
        {job.site_map_path ? (
          <iframe
            src={
              publicJobFileUrl(supabaseUrl, job.site_map_path) + "#view=FitH"
            }
            title="Site map"
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
            No site map PDF uploaded for this job yet.
          </div>
        )}
      </div>
    </div>
  );
}
