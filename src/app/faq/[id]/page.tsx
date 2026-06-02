import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FaqDetailClient } from "@/components/FaqDetailClient";
import type { FaqEntry, FaqPhoto } from "@/lib/faq";

export default async function FaqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: entry, error },
    { data: photos, error: photosError },
  ] = await Promise.all([
    supabase.from("faq_entries").select("*").eq("id", id).single(),
    supabase
      .from("faq_photos")
      .select("*")
      .eq("faq_entry_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (error || !entry) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href="/faq"
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
          {entry.title}
        </h1>
      </header>

      <FaqDetailClient
        initialEntry={entry as FaqEntry}
        initialPhotos={(photos ?? []) as FaqPhoto[]}
        photosLoadError={photosError?.message ?? null}
      />
    </>
  );
}
