"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completePasswordReset } from "../actions";

type ResetRequest = {
  id: string;
  email: string;
  requested_at: string;
  approved_at: string | null;
  fulfilled_at: string | null;
};

const inputClass =
  "block h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10";

// Next.js requires every useSearchParams() consumer to live inside a
// Suspense boundary so static prerender can bail out cleanly. Wrap
// the real component and provide a minimal fallback.
export default function ResetStatusPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6 py-12 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
          Loading…
        </main>
      }
    >
      <ResetStatusInner />
    </Suspense>
  );
}

function ResetStatusInner() {
  const params = useSearchParams();
  const router = useRouter();
  const email = (params.get("email") ?? "").trim().toLowerCase();

  const [request, setRequest] = useState<ResetRequest | null>(null);
  // Stay in "loading" forever when no email is supplied — the UI
  // routes to the missing-email panel via the `!email` branch, so
  // the loading spinner is never actually shown in that case.
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const supabase = createClient();

    async function fetchLatest() {
      const { data } = await supabase
        .from("password_reset_requests")
        .select("*")
        .eq("email", email)
        .order("requested_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setRequest((data?.[0] as ResetRequest) ?? null);
      setLoading(false);
    }

    void fetchLatest();

    const channel = supabase
      .channel(`reset-${email}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "password_reset_requests",
          filter: `email=eq.${email}`,
        },
        () => {
          void fetchLatest();
        },
      )
      .subscribe();

    // Belt-and-suspenders: poll every 15s in case the realtime channel
    // drops between approval and the user looking at the screen.
    const interval = window.setInterval(fetchLatest, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await completePasswordReset(email, password);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    window.setTimeout(() => router.replace("/signin"), 1800);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="w-full max-w-sm space-y-4">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset password
          </h1>
          {email && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {email}
            </p>
          )}
        </header>

        {!email && (
          <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            Missing email.{" "}
            <Link href="/forgot-password" className="underline">
              Start a new request
            </Link>
            .
          </p>
        )}

        {email && loading && (
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            Checking…
          </p>
        )}

        {email && !loading && !request && (
          <div className="space-y-3">
            <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              No reset request on file for {email}.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full text-center text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              Submit a new request
            </Link>
          </div>
        )}

        {request && done && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Password updated. Redirecting to sign in…
          </p>
        )}

        {request && !done && request.fulfilled_at && (
          <div className="space-y-3">
            <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              This reset was already used.
            </p>
            <Link
              href="/signin"
              className="block h-14 w-full rounded-xl bg-neutral-900 text-center text-base font-medium leading-[3.5rem] text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Go to sign in
            </Link>
          </div>
        )}

        {request && !done && !request.fulfilled_at && !request.approved_at && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-neutral-100 px-4 py-3 dark:bg-neutral-900">
              <svg
                className="h-4 w-4 flex-shrink-0 animate-spin text-neutral-500"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeOpacity="0.25"
                />
                <path
                  d="M22 12a10 10 0 0 0-10-10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Waiting for Mark to approve. This page will update on its
                own — leave it open.
              </p>
            </div>
            <Link
              href="/signin"
              className="block w-full text-center text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              Cancel and go back
            </Link>
          </div>
        )}

        {request &&
          !done &&
          !request.fulfilled_at &&
          request.approved_at && (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Approved. Choose a new password below.
              </p>
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium"
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className={inputClass}
                />
              </div>

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
                {pending ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}
      </div>
    </main>
  );
}
