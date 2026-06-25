import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { LiveUpdater } from "@/components/LiveUpdater";
import { PendingApprovalsBanner } from "@/components/PendingApprovalsBanner";
import { SectionTabs } from "@/components/SectionTabs";
import { FaqSubTabs } from "@/components/FaqSubTabs";
import { MarkFaqSeen } from "@/components/MarkFaqSeen";
import { Avatar } from "@/components/Avatar";
import { isAdminEmail } from "@/lib/admin";
import { firstNameFromEmail } from "@/lib/faq-qa";

export default async function FaqQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

  const [{ data: questions, error }, pendingApprovals, { data: answerCounts }] =
    await Promise.all([
      supabase
        .from("faq_questions")
        .select(
          "id, title, body, created_by_email, pinned_answer_id, created_at, updated_at",
        )
        .order("updated_at", { ascending: false }),
      isAdmin
        ? supabase
            .from("user_approvals")
            .select("*", { count: "exact", head: true })
            .is("approved_at", null)
        : Promise.resolve({ count: 0 }),
      supabase.from("faq_answers").select("question_id"),
    ]);

  const pendingCount =
    isAdmin && "count" in pendingApprovals ? (pendingApprovals.count ?? 0) : 0;

  const answerCountByQuestion = new Map<string, number>();
  for (const a of answerCounts ?? []) {
    answerCountByQuestion.set(
      a.question_id,
      (answerCountByQuestion.get(a.question_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <LiveUpdater channelName="faq-questions-list" table="faq_questions" />
      <MarkFaqSeen category="qa" />
      <AppHeader />
      {isAdmin && <PendingApprovalsBanner initialCount={pendingCount} />}
      <SectionTabs active="faq" />
      <FaqSubTabs active="qa" />
      <section className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load questions: {error.message}
          </p>
        ) : !questions || questions.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => {
              const count = answerCountByQuestion.get(q.id) ?? 0;
              return (
                <li key={q.id}>
                  <Link
                    href={`/faq/q/${q.id}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-3 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar email={q.created_by_email} size={28} />
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {firstNameFromEmail(q.created_by_email)}
                      </span>
                      <span className="ml-auto text-[11px] text-neutral-400">
                        {count} {count === 1 ? "answer" : "answers"}
                        {q.pinned_answer_id ? " · pinned" : ""}
                      </span>
                    </div>
                    <p className="mt-1.5 text-base font-medium">{q.title}</p>
                    {q.body && (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {q.body}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Link
        href="/faq/q/new"
        aria-label="Ask a question"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition active:scale-95 dark:bg-neutral-100 dark:text-neutral-900"
      >
        <svg
          className="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-900">
        <svg
          className="h-8 w-8 text-neutral-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
          <path d="M12 17h.01" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-medium">No questions yet</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        Tap + to ask the first one. Anyone in the company can answer; the
        best answer can be pinned to the top.
      </p>
    </div>
  );
}
