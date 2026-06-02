import Link from "next/link";

type Sub = { href: string; label: string; key: "articles" | "qa" };

const TABS: readonly Sub[] = [
  { href: "/faq", label: "Articles", key: "articles" },
  { href: "/faq/q", label: "Q&A", key: "qa" },
];

export function FaqSubTabs({ active }: { active: "articles" | "qa" }) {
  return (
    <nav
      aria-label="FAQ section"
      className="mx-auto w-full max-w-md px-4 pt-2"
    >
      <div className="flex gap-1 rounded-lg bg-neutral-200/60 p-1 dark:bg-neutral-900">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition " +
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
