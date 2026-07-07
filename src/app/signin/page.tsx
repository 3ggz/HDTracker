"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/email";
import { getBuildVersion } from "@/lib/build-version";
import { FEATURES } from "@/lib/features";

type Stage = "email" | "password";

const inputClass =
  "block h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-100 dark:focus:ring-neutral-100/10 dark:disabled:bg-neutral-950 dark:disabled:text-neutral-500";

export default function SignInPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hdtracker_remember_me");
      // Mount-time localStorage read — the one-shot sync is the
      // point; there's no cascading-render loop here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setRememberMe(saved === "true");
    } catch {
      // localStorage can be unavailable (private mode, etc) — ignore.
    }
  }, []);

  function onRememberMeChange(checked: boolean) {
    setRememberMe(checked);
    try {
      localStorage.setItem(
        "hdtracker_remember_me",
        checked ? "true" : "false",
      );
    } catch {
      // ignore
    }
  }

  async function onContinue(e: React.FormEvent) {
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
    const { data, error: lookupError } = await supabase
      .from("known_emails")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    setPending(false);

    if (lookupError) {
      setError(lookupError.message);
      return;
    }

    setIsNewUser(!data);
    setStage("password");
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { error: authError } = isNewUser
      ? await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        })
      : await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

    if (authError) {
      setError(authError.message);
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  function onUseDifferentEmail() {
    setStage("email");
    setPassword("");
    setIsNewUser(false);
    setError(null);
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="w-full max-w-sm">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            HD Security Systems
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Internal tools
          </p>
        </header>

        <form
          onSubmit={stage === "email" ? onContinue : onSubmitPassword}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus={stage === "email"}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={stage === "password"}
              placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
              className={inputClass}
            />
          </div>

          {stage === "password" && (
            <div className="space-y-2">
              {isNewUser && (
                <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                  No account yet for this email. Enter a password to create
                  one.
                </p>
              )}
              <label
                htmlFor="password"
                className="block text-sm font-medium"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isNewUser ? "new-password" : "current-password"}
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
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => onRememberMeChange(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-600 dark:bg-neutral-800"
            />
            Remember me
          </label>

          <button
            type="submit"
            disabled={pending}
            className="block h-14 w-full rounded-xl bg-neutral-900 text-base font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending
              ? stage === "email"
                ? "Checking..."
                : isNewUser
                  ? "Creating..."
                  : "Signing in..."
              : stage === "email"
                ? "Continue"
                : isNewUser
                  ? "Create account"
                  : "Sign in"}
          </button>

          {stage === "password" && (
            <>
              <button
                type="button"
                onClick={onUseDifferentEmail}
                disabled={pending}
                className="block w-full text-center text-sm text-neutral-600 underline-offset-4 hover:underline disabled:opacity-60 dark:text-neutral-400"
              >
                Use a different email
              </button>
              {FEATURES.showForgotPasswordLink && (
                <Link
                  href="/forgot-password"
                  className="block w-full text-center text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
                >
                  Forgot password?
                </Link>
              )}
            </>
          )}

          <p className="pt-2 text-center text-xs text-neutral-500 dark:text-neutral-500">
            Only @{ALLOWED_EMAIL_DOMAIN} addresses can sign in.
          </p>
        </form>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
        v{getBuildVersion()}
      </p>
    </main>
  );
}
