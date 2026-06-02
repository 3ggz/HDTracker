"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { publicFaqPhotoUrl } from "@/lib/faq-photos";
import {
  deleteFaqQuestionPhoto,
  firstNameFromEmail,
  uploadFaqQuestionPhoto,
  type FaqAnswer,
  type FaqQuestion,
  type FaqQuestionPhoto,
} from "@/lib/faq-qa";
import { Avatar } from "./Avatar";

const textareaClass =
  "block min-h-[100px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

export function FaqQuestionDetailClient({
  initialQuestion,
  initialPhotos,
  initialAnswers,
  currentUserId,
  currentUserEmail,
}: {
  initialQuestion: FaqQuestion;
  initialPhotos: FaqQuestionPhoto[];
  initialAnswers: FaqAnswer[];
  currentUserId: string | null;
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [question, setQuestion] = useState(initialQuestion);
  const [photos, setPhotos] = useState(initialPhotos);
  const [answers, setAnswers] = useState(initialAnswers);

  const sortedAnswers = useMemo(() => {
    return [...answers].sort((a, b) => {
      const aPinned = a.id === question.pinned_answer_id ? 1 : 0;
      const bPinned = b.id === question.pinned_answer_id ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [answers, question.pinned_answer_id]);

  async function togglePin(answerId: string) {
    const isPinned = question.pinned_answer_id === answerId;
    const next = isPinned ? null : answerId;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faq_questions")
      .update({ pinned_answer_id: next })
      .eq("id", question.id)
      .select("*")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Couldn't update pin.");
      return;
    }
    setQuestion(data as FaqQuestion);
  }

  async function deleteAnswer(answerId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faq_answers")
      .delete()
      .eq("id", answerId)
      .select("id");
    if (error) {
      alert(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("No rows affected.");
      return;
    }
    setAnswers((current) => current.filter((a) => a.id !== answerId));
    if (question.pinned_answer_id === answerId) {
      setQuestion((q) => ({ ...q, pinned_answer_id: null }));
    }
  }

  async function deleteQuestion() {
    if (!confirm("Delete this question and all its answers?")) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faq_questions")
      .delete()
      .eq("id", question.id)
      .select("id");
    if (error) {
      alert(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("No rows affected.");
      return;
    }
    router.push("/faq/q");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-32 pt-4">
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <Avatar email={question.created_by_email} size={32} />
          <div className="flex-1 leading-tight">
            <p className="text-sm font-medium">
              {firstNameFromEmail(question.created_by_email)}
            </p>
            <p className="text-[10px] text-neutral-400">
              {new Date(question.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <h2 className="text-lg font-semibold leading-snug">{question.title}</h2>
        {question.body && (
          <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {question.body}
          </p>
        )}
        <QuestionPhotos
          questionId={question.id}
          photos={photos}
          supabaseUrl={supabaseUrl}
          canEdit={
            !!currentUserId &&
            (question.created_by_id == null ||
              question.created_by_id === currentUserId)
          }
          onAdded={(p) => setPhotos((cur) => [...cur, p])}
          onDeleted={(id) =>
            setPhotos((cur) => cur.filter((p) => p.id !== id))
          }
        />
        {(question.created_by_id == null ||
          question.created_by_id === currentUserId) && (
          <button
            type="button"
            onClick={deleteQuestion}
            className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 dark:border-red-900 dark:text-red-400"
          >
            Delete question
          </button>
        )}
      </section>

      <section>
        <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {answers.length} {answers.length === 1 ? "answer" : "answers"}
        </h3>
        {answers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No answers yet. Be the first.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedAnswers.map((a) => (
              <AnswerRow
                key={a.id}
                answer={a}
                pinned={a.id === question.pinned_answer_id}
                canMutate={
                  !!currentUserId &&
                  (a.created_by_id == null ||
                    a.created_by_id === currentUserId)
                }
                onTogglePin={() => togglePin(a.id)}
                onDelete={() => deleteAnswer(a.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <NewAnswerForm
        questionId={question.id}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        onPosted={(answer) =>
          setAnswers((current) => [...current, answer])
        }
      />
    </main>
  );
}

function AnswerRow({
  answer,
  pinned,
  canMutate,
  onTogglePin,
  onDelete,
}: {
  answer: FaqAnswer;
  pinned: boolean;
  canMutate: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li
      className={
        "rounded-xl border p-3 " +
        (pinned
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <Avatar email={answer.created_by_email} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-medium">
            {firstNameFromEmail(answer.created_by_email)}
            {pinned && (
              <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                Pinned
              </span>
            )}
          </p>
          <p className="text-[10px] text-neutral-400">
            {new Date(answer.created_at).toLocaleString()}
          </p>
        </div>
        <svg
          className={
            "h-4 w-4 text-neutral-400 transition-transform " +
            (open ? "rotate-180" : "")
          }
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {answer.body}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onTogglePin}
              className={
                "h-8 rounded-md px-2.5 text-[11px] font-medium transition " +
                (pinned
                  ? "border border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-100"
                  : "border border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300")
              }
            >
              {pinned ? "Unpin" : "Pin"}
            </button>
            {canMutate && (
              <button
                type="button"
                onClick={onDelete}
                className="h-8 rounded-md border border-red-300 px-2.5 text-[11px] font-medium text-red-600 dark:border-red-900 dark:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function NewAnswerForm({
  questionId,
  currentUserId,
  currentUserEmail,
  onPosted,
}: {
  questionId: string;
  currentUserId: string | null;
  currentUserEmail: string | null;
  onPosted: (answer: FaqAnswer) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("faq_answers")
      .insert({
        question_id: questionId,
        body: trimmed,
        created_by_id: currentUserId,
        created_by_email: currentUserEmail,
      })
      .select("*")
      .single();
    setPending(false);
    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't post.");
      return;
    }
    setBody("");
    onPosted(data as FaqAnswer);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Your answer
      </h3>
      <textarea
        className={textareaClass}
        placeholder="Share what you know..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="h-11 w-full rounded-lg bg-neutral-900 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Posting..." : "Post answer"}
      </button>
    </form>
  );
}

function QuestionPhotos({
  questionId,
  photos,
  supabaseUrl,
  canEdit,
  onAdded,
  onDeleted,
}: {
  questionId: string;
  photos: FaqQuestionPhoto[];
  supabaseUrl: string;
  canEdit: boolean;
  onAdded: (p: FaqQuestionPhoto) => void;
  onDeleted: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const result = await uploadFaqQuestionPhoto({
      supabase,
      file,
      questionId,
    });
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdded(result.photo);
  }

  async function remove(photo: FaqQuestionPhoto) {
    const supabase = createClient();
    const result = await deleteFaqQuestionPhoto(supabase, photo);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    onDeleted(photo.id);
  }

  if (!canEdit && photos.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
            >
              <a
                href={publicFaqPhotoUrl(supabaseUrl, p.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicFaqPhotoUrl(supabaseUrl, p.storage_path)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  aria-label="Delete photo"
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && photos.length < 2 && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onChange}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="h-9 rounded-md border border-dashed border-neutral-300 px-3 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
          >
            {uploading ? "Uploading..." : "+ Photo"}
          </button>
        </>
      )}
    </div>
  );
}
