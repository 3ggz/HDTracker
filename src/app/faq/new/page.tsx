"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "block h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

const textareaClass =
  "block min-h-[160px] w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

export default function NewFaqPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string | null)?.trim();
    if (!title) {
      setError("Give it a title first.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("faq_entries")
      .insert({
        title,
        body: (formData.get("body") as string | null)?.trim() || null,
      })
      .select("id")
      .single();

    if (dbError || !data) {
      setError(dbError?.message ?? "Couldn't save. Try again.");
      setPending(false);
      return;
    }

    router.push(`/faq/${data.id}`);
    router.refresh();
  }

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
        <h1 className="text-base font-semibold tracking-tight">
          New FAQ entry
        </h1>
      </header>

      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-6"
      >
        <Field label="Title" required>
          <input
            name="title"
            type="text"
            required
            autoFocus
            placeholder="Title"
            className={inputClass}
          />
        </Field>

        <Field label="Body" hint="Optional — add photos on the next screen">
          <textarea
            name="body"
            placeholder="Description"
            className={textareaClass}
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="block h-14 w-full rounded-xl bg-neutral-900 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? "Saving..." : "Save entry"}
        </button>
      </form>
    </>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between text-sm font-medium">
        <span>
          {label}
          {required && (
            <span className="text-red-600 dark:text-red-400"> *</span>
          )}
        </span>
        {hint && (
          <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
