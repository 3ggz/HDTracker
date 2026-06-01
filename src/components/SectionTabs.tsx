import Link from "next/link";

type Tab = { href: string; label: string };

const TABS: readonly Tab[] = [
  { href: "/", label: "Vehicles" },
  { href: "/jobs", label: "Jobs" },
];

export function SectionTabs({ active }: { active: "vehicles" | "jobs" }) {
  return (
    <nav
      aria-label="Sections"
      className="mx-auto w-full max-w-md px-4 pt-3"
    >
      <div className="flex gap-2 rounded-xl bg-neutral-200/60 p-1 dark:bg-neutral-900">
        {TABS.map((tab) => {
          const isActive =
            (tab.label === "Vehicles" && active === "vehicles") ||
            (tab.label === "Jobs" && active === "jobs");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition " +
                (isActive
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 active:text-neutral-900 dark:text-neutral-400 dark:active:text-neutral-100")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
