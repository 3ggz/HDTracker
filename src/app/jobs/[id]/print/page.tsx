import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobPrintView } from "@/components/JobPrintView";
import type { Job, JobDoor, JobDoorItem } from "@/lib/jobs";
import type { JobPhoto } from "@/lib/job-photos";

export default async function JobPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job, error }, { data: doors }, { data: photos }] =
    await Promise.all([
      supabase.from("jobs").select("*").eq("id", id).single(),
      supabase
        .from("job_doors")
        .select("*")
        .eq("job_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("job_photos")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (error || !job) notFound();

  const doorIds = (doors ?? []).map((d) => d.id);
  const { data: items } =
    doorIds.length === 0
      ? { data: [] as JobDoorItem[] }
      : await supabase
          .from("job_door_items")
          .select("*")
          .in("door_id", doorIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

  const itemPhotoPaths = (items ?? [])
    .map((it) => it.photo_storage_path)
    .filter((p): p is string => Boolean(p));

  return (
    <JobPrintView
      job={job as Job}
      doors={(doors ?? []) as JobDoor[]}
      items={(items ?? []) as JobDoorItem[]}
      photos={(photos ?? []) as JobPhoto[]}
      itemPhotoPaths={itemPhotoPaths}
    />
  );
}
