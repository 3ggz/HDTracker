import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { PendingApprovalLive } from "@/components/PendingApprovalLive";

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: approval } = await supabase
    .from("user_approvals")
    .select("approved_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (approval?.approved_at) redirect("/");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <PendingApprovalLive userId={user.id} />

      <div className="w-full max-w-sm text-center">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            HDTracker
            <span className="ml-1.5 align-baseline text-sm font-normal italic text-neutral-400 dark:text-neutral-500">
              Beta
            </span>
          </h1>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-left dark:border-amber-900/40 dark:bg-amber-950/30">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            Awaiting Authorization
          </h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Your account has been created and is waiting for an admin to
            approve it. As soon as an admin approves the request, this
            screen will let you through automatically — no need to refresh.
          </p>
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            Signed in as{" "}
            <span className="font-mono">{user.email}</span>
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
