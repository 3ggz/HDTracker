import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicJobFileUrl } from "@/lib/job-photos";
import {
  PdfMapEditor,
  type Annotation,
} from "@/components/PdfMapEditor";

export default async function JobMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: job, error }, { data: annotationRows }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, site_map_path")
      .eq("id", id)
      .single(),
    supabase
      .from("job_map_annotations")
      .select("page_index, data")
      .eq("job_id", id),
  ]);
  if (error || !job) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  if (!job.site_map_path) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900 text-neutral-100">
        <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
          <Link
            href={`/jobs/${job.id}`}
            aria-label="Back to job"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 active:bg-neutral-800"
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
          <p className="truncate flex-1 text-sm font-medium">
            {job.name} · Site map
          </p>
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-400">
          No site map PDF uploaded for this job yet.
        </div>
      </div>
    );
  }

  const initialAnnotationsByPage: Record<number, Annotation[]> = {};
  for (const row of annotationRows ?? []) {
    if (Array.isArray(row.data)) {
      initialAnnotationsByPage[row.page_index as number] =
        row.data as Annotation[];
    }
  }

  return (
    <PdfMapEditor
      jobId={job.id}
      jobName={job.name}
      pdfUrl={publicJobFileUrl(supabaseUrl, job.site_map_path)}
      initialAnnotationsByPage={initialAnnotationsByPage}
    />
  );
}
