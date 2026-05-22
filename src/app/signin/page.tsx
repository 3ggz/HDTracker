"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/email";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isAllowedEmail(email)) {
      setStatus({
        kind: "error",
        message: `Only @${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.`,
      });
      return;
    }

    setStatus({ kind: "sending" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    setStatus({ kind: "sent", email: email.trim().toLowerCase() });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="w-full max-w-sm">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">HDTracker</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Vehicle inventory for the team
          </p>
        </header>

        {status.kind === "sent" ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-lg font-medium">Check your email</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              We sent a sign-in link to{" "}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {status.email}
              </span>
              . Tap it on this device to finish signing in.
            </p>
            <button
              type="button"
              onClick={() => setStatus({ kind: "idle" })}
              className="mt-6 text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium"
              >
                Work email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status.kind === "error") setStatus({ kind: "idle" });
                }}
                placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                className="block h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10"
              />
            </div>

            {status.kind === "error" && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="block h-14 w-full rounded-xl bg-neutral-900 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {status.kind === "sending" ? "Sending link..." : "Send magic link"}
            </button>

            <p className="pt-2 text-center text-xs text-neutral-500 dark:text-neutral-500">
              Only @{ALLOWED_EMAIL_DOMAIN} addresses can sign in.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
