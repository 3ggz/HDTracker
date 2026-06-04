"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/email";

const inputClass =
  "block h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10 dark:disabled:bg-neutral-950 dark:disabled:text-neutral-500";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = email.trim().toLowerCase();
    if (!isAllowedEmail(normalized)) {
      setError(
        `Only @${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.`,
      );
      return;
    }

    setPending(true);
    const supabase = createClient();

    // Don't take requests for emails that never signed up — keeps the
    // admin queue clean and gives the user a faster "no account" error.
    const { data: known, error: lookupError } = await supabase
      .from("known_emails")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    if (lookupError) {
      setPending(false);
      setError(lookupError.message);
      return;
    }
    if (!known) {
      setPending(false);
      setError(
        `No account found for ${normalized}. Create one on the sign-in page first.`,
      );
      return;
    }

    const { error: insertError } = await supabase
      .from("password_reset_requests")
      .insert({ email: normalized });
    setPending(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.replace(
      `/forgot-password/status?email=${encodeURIComponent(normalized)}`,
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset password
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enter your email and Mark will get a notification to approve
            the reset. Once approved, you&apos;ll be able to set a new
            password right here.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
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
                if (error) setError(null);
              }}
              placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
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
            {pending ? "Submitting..." : "Request reset"}
          </button>

          <Link
            href="/signin"
            className="block w-full text-center text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}
