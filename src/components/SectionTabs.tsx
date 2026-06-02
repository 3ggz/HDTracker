import Link from "next/link";

type Tab = { href: string; label: string; key: "vehicles" | "jobs" | "faq" };

const TABS: readonly Tab[] = [
  { href: "/", label: "Vehicles", key: "vehicles" },
  { href: "/jobs", label: "Jobs", key: "jobs" },
  { href: "/faq", label: "FAQ", key: "faq" },
];

export function SectionTabs({
  active,
}: {
  active: "vehicles" | "jobs" | "faq";
}) {
  return (
    <nav aria-label="Sections" className="mx-auto w-full max-w-md px-4 pt-3">
      <div className="flex gap-2 rounded-xl bg-neutral-200/60 p-1 dark:bg-neutral-900">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
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
