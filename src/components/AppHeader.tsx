import { DevModeBadge } from "./DevModeBadge";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <h1 className="text-base font-semibold tracking-tight">HDTracker</h1>
      <DevModeBadge />
    </header>
  );
}
