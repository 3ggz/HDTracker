import {
  activityActorName as sharedActorName,
  formatRelativeTime,
  groupActivitiesByDay,
} from "./vehicle-activity";

export type JobActivityAction =
  | "added"
  | "updated"
  | "removed"
  | "completed"
  | "uncompleted";

export type JobActivitySubjectType = "job" | "door" | "item" | "photo" | "site_map";

export type JobActivity = {
  id: string;
  job_id: string;
  action: JobActivityAction;
  subject_type: JobActivitySubjectType;
  subject_label: string | null;
  details: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
};

export { formatRelativeTime, groupActivitiesByDay };

export function jobActivityActorName(activity: JobActivity): string {
  return sharedActorName({ user_email: activity.user_email });
}

export function describeJobActivity(activity: JobActivity): string {
  const label = activity.subject_label ?? "";
  const door =
    typeof activity.details?.door === "string"
      ? (activity.details.door as string)
      : null;

  switch (activity.subject_type) {
    case "job":
      if (activity.action === "added") return `Created job “${label}”`;
      return `Updated job “${label}”`;
    case "door":
      if (activity.action === "added") return `Added door ${label}`;
      if (activity.action === "removed") return `Removed door ${label}`;
      return `Updated door ${label}`;
    case "item":
      if (activity.action === "added")
        return `Added ${label}${door ? ` to ${door}` : ""}`;
      if (activity.action === "removed")
        return `Removed ${label}${door ? ` from ${door}` : ""}`;
      if (activity.action === "completed")
        return `Marked ${label} done${door ? ` on ${door}` : ""}`;
      if (activity.action === "uncompleted")
        return `Reopened ${label}${door ? ` on ${door}` : ""}`;
      return `Updated ${label}${door ? ` on ${door}` : ""}`;
    case "photo":
      if (activity.action === "added")
        return label ? `Added photo: ${label}` : "Added photo";
      return "Removed photo";
    case "site_map":
      if (activity.action === "removed") return "Removed site map PDF";
      return "Updated site map PDF";
    default:
      return `${activity.action} ${label}`;
  }
}
