import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FaqQuestionDetailClient } from "@/components/FaqQuestionDetailClient";
import type {
  FaqAnswer,
  FaqQuestion,
  FaqQuestionPhoto,
} from "@/lib/faq-qa";

export default async function FaqQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: question, error },
    { data: photos },
    { data: answers },
    { data: { user } },
  ] = await Promise.all([
    supabase.from("faq_questions").select("*").eq("id", id).single(),
    supabase
      .from("faq_question_photos")
      .select("*")
      .eq("question_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("faq_answers")
      .select("*")
      .eq("question_id", id)
      .order("created_at", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  if (error || !question) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href="/faq/q"
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
          Question
        </h1>
      </header>

      <FaqQuestionDetailClient
        initialQuestion={question as FaqQuestion}
        initialPhotos={(photos ?? []) as FaqQuestionPhoto[]}
        initialAnswers={(answers ?? []) as FaqAnswer[]}
        currentUserId={user?.id ?? null}
        currentUserEmail={user?.email ?? null}
      />
    </>
  );
}
