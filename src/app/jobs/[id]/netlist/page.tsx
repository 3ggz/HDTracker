import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { compareDoorNames, type Job, type JobDoorItem } from "@/lib/jobs";

// Standalone IP / MAC sheet — one clean table, nothing else. Meant
// for handing to network admins as its own full-screen view (the
// job editor also has an in-place "Export IP / MAC PDF" for a quick
// print without leaving the page; this is the browsable version).
export default async function JobNetListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job, error }, { data: doors }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase.from("job_doors").select("id, name").eq("job_id", id),
  ]);

  if (error || !job) notFound();
  const typedJob = job as Job;

  const doorIds = (doors ?? []).map((d) => d.id);
  const { data: items } =
    doorIds.length === 0
      ? { data: [] as JobDoorItem[] }
      : await supabase
          .from("job_door_items")
          .select("*")
          .in("door_id", doorIds)
          .or("ip_address.not.is.null,mac_address.not.is.null");

  const doorNameById = new Map(
    (doors ?? []).map((d) => [d.id as string, (d.name as string) || "—"]),
  );
  const rows = ((items ?? []) as JobDoorItem[])
    .filter((it) => it.ip_address || it.mac_address)
    .map((it) => ({
      id: it.id,
      door: doorNameById.get(it.door_id) ?? "—",
      item: it.name,
      ip: it.ip_address,
      mac: it.mac_address,
    }))
    .sort((a, b) => compareDoorNames(a.door, b.door));

  const doorCounts = new Map<string, number>();
  for (const r of rows) {
    doorCounts.set(r.door, (doorCounts.get(r.door) ?? 0) + 1);
  }
  const showDevice = Array.from(doorCounts.values()).some((n) => n > 1);

  // Server component is dynamic (ƒ), so this is the moment of export.
  const exportedAt = new Date()
    .toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    .replace(/,/g, "");

  return (
    <>
      <style>{`
        /* margin:0 kills the browser's injected URL footer and
           "page 1 of 2" counter (no margin box to draw them in). */
        @page { margin: 0; }
        @media print {
          main { padding: 0.5in !important; }
          .netlist-toolbar { display: none !important; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          thead { display: table-header-group; }
          body { background: white; }
        }
      `}</style>

      <header className="netlist-toolbar sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <Link
          href={`/jobs/${typedJob.id}`}
          aria-label="Back"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full active:bg-neutral-200/60 dark:active:bg-neutral-800/60"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            IP / MAC list
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {typedJob.name}
          </h1>
        </div>
        <ExportPdfButton
          documentTitle={`${typedJob.name} IP-MAC list - ${exportedAt}`}
        />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-5 print:max-w-none print:px-0 print:pt-0">
        <div className="mb-4 print:mb-3">
          <h2 className="text-lg font-bold leading-tight print:text-base">
            {typedJob.name}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500 print:text-xs dark:text-neutral-400">
            {typedJob.number && <>#{typedJob.number} · </>}
            IP / MAC list · {rows.length}{" "}
            {rows.length === 1 ? "device" : "devices"} · Exported {exportedAt}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No IP or MAC addresses recorded yet. Fill them in on the
            5500s in the job editor first.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm print:text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-left dark:border-neutral-700">
                <th className="py-1.5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Door
                </th>
                {showDevice && (
                  <th className="py-1.5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Device
                  </th>
                )}
                <th className="py-1.5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  IP
                </th>
                <th className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  MAC
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-200 dark:border-neutral-800"
                >
                  <td className="py-1.5 pr-3 font-medium">{r.door}</td>
                  {showDevice && (
                    <td className="py-1.5 pr-3 text-neutral-600 dark:text-neutral-400">
                      {r.item}
                    </td>
                  )}
                  <td className="py-1.5 pr-3 font-mono tabular-nums">
                    {r.ip ?? "—"}
                  </td>
                  <td className="py-1.5 font-mono tabular-nums">
                    {r.mac ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
