import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guarantees a signed-in user at this point, but TS doesn't know.
  if (!user) return null;

  return (
    <main className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold tracking-tight">HDTracker</h1>
        <SignOutButton />
      </header>

      <section className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Signed in as
        </p>
        <p className="mt-1 text-base font-medium">{user.email}</p>

        <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          Vehicles, inventory, and tools will live here. Coming next.
        </div>
      </section>
    </main>
  );
}
