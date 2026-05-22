"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/signin");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-sm font-medium text-neutral-600 underline-offset-4 active:text-neutral-900 hover:underline disabled:opacity-60 dark:text-neutral-400 dark:active:text-neutral-100"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
