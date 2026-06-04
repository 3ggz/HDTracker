import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";
import { getBuildVersion } from "@/lib/build-version";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="leading-tight">
        <h1 className="text-base font-semibold tracking-tight">
          HDTracker
          <span className="ml-1.5 align-baseline text-[11px] font-normal italic text-neutral-400 dark:text-neutral-500">
            Beta
          </span>
        </h1>
        <p className="mt-0.5 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
          v{getBuildVersion()}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin/resets"
            className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
          >
            Resets
          </Link>
        )}
        <Link
          href="/quickview"
          className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline dark:text-neutral-400 dark:active:text-neutral-100"
        >
          Quick view
        </Link>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
