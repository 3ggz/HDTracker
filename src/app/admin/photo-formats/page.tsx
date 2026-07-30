import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { JOB_BUCKET } from "@/lib/job-photos";
import { PHOTO_BUCKET } from "@/lib/vehicle-photos";
import { FAQ_BUCKET } from "@/lib/faq-photos";
import {
  PhotoFormatBackfill,
  type StaleFormatPhoto,
} from "@/components/PhotoFormatBackfill";

// Photos uploaded before the upload path converted HEIC to JPEG are
// still sitting in storage as HEIC, which Android can't render. The
// upload fix only helps new photos, so the old ones need a sweep.

const SOURCES = [
  { table: "job_photos", bucket: JOB_BUCKET },
  { table: "vehicle_photos", bucket: PHOTO_BUCKET },
  { table: "faq_photos", bucket: FAQ_BUCKET },
  { table: "faq_question_photos", bucket: FAQ_BUCKET },
] as const;

export default async function PhotoFormatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) notFound();

  // Two ilike queries per table rather than one .or() — the pattern
  // contains a dot, which PostgREST's or() grammar also uses as a
  // separator.
  const results = await Promise.all(
    SOURCES.flatMap(({ table, bucket }) =>
      ["%.heic", "%.heif"].map(async (pattern) => {
        const { data } = await supabase
          .from(table)
          .select("id, storage_path")
          .ilike("storage_path", pattern);
        return ((data ?? []) as { id: string; storage_path: string }[]).map(
          (row): StaleFormatPhoto => ({
            id: row.id,
            table,
            bucket,
            storagePath: row.storage_path,
          }),
        );
      }),
    ),
  );

  const seen = new Set<string>();
  const photos = results.flat().filter((p) => {
    const key = `${p.table}:${p.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href="/admin/approvals"
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
            Admin
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            Photo formats
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        <PhotoFormatBackfill photos={photos} />
      </main>
    </>
  );
}
