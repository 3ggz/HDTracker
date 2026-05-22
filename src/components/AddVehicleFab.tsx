import Link from "next/link";

export function AddVehicleFab() {
  return (
    <Link
      href="/vehicles/new"
      aria-label="Add vehicle"
      className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition active:scale-95 dark:bg-neutral-100 dark:text-neutral-900"
    >
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </Link>
  );
}
