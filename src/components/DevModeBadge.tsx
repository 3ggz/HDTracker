export function DevModeBadge() {
  return (
    <span
      title="Auth is disabled — anyone visiting this app can read and write all data. Re-enable in src/lib/supabase/middleware.ts."
      className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      Dev · auth off
    </span>
  );
}
