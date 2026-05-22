export type VehicleActivityAction =
  | "added"
  | "updated"
  | "removed"
  | "resolved"
  | "reopened";

export type VehicleActivitySubjectType =
  | "vehicle"
  | "hardware"
  | "tool"
  | "issue"
  | "location"
  | "photo";

export type VehicleActivity = {
  id: string;
  vehicle_id: string;
  action: VehicleActivityAction;
  subject_type: VehicleActivitySubjectType;
  subject_label: string | null;
  details: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
};

type QuantityDiff = {
  from?: { name?: string; quantity?: string };
  to?: { name?: string; quantity?: string };
};

export function describeVehicleActivity(activity: VehicleActivity): string {
  const subject = activity.subject_label?.trim() || "(unnamed)";
  const details = activity.details as
    | (QuantityDiff & { quantity?: string; last_quantity?: string })
    | null;

  switch (activity.action) {
    case "added":
      switch (activity.subject_type) {
        case "vehicle":
          return `Created vehicle "${subject}"`;
        case "hardware":
        case "tool": {
          const qty = details?.quantity?.trim();
          return qty
            ? `Added ${activity.subject_type}: ${subject} (${qty})`
            : `Added ${activity.subject_type}: ${subject}`;
        }
        case "issue":
          return `Logged issue: ${subject}`;
        case "location":
          return `Added location`;
        case "photo": {
          const issueId = (activity.details as { issue_id?: string } | null)
            ?.issue_id;
          return issueId ? "Added a photo to an issue" : "Added a photo";
        }
      }
      break;

    case "updated":
      switch (activity.subject_type) {
        case "vehicle":
          return `Updated vehicle details`;
        case "location":
          return activity.subject_label
            ? `Updated location: ${subject}`
            : `Cleared location`;
        case "hardware":
        case "tool": {
          const from = details?.from;
          const to = details?.to;
          if (from && to) {
            const nameChanged = from.name !== to.name;
            const qtyChanged = from.quantity !== to.quantity;
            if (nameChanged && qtyChanged) {
              return `Updated ${activity.subject_type}: ${from.name} (${from.quantity}) → ${to.name} (${to.quantity})`;
            }
            if (qtyChanged) {
              return `${subject}: ${from.quantity} → ${to.quantity}`;
            }
            if (nameChanged) {
              return `Renamed ${activity.subject_type}: ${from.name} → ${to.name}`;
            }
          }
          return `Updated ${activity.subject_type}: ${subject}`;
        }
        case "issue":
          return `Edited issue: ${subject}`;
      }
      break;

    case "removed":
      switch (activity.subject_type) {
        case "hardware":
        case "tool": {
          const lastQty = details?.last_quantity?.trim();
          return lastQty
            ? `Removed ${activity.subject_type}: ${subject} (was ${lastQty})`
            : `Removed ${activity.subject_type}: ${subject}`;
        }
        case "issue":
          return `Deleted issue: ${subject}`;
        case "photo": {
          const issueId = (activity.details as { issue_id?: string } | null)
            ?.issue_id;
          return issueId ? "Removed a photo from an issue" : "Removed a photo";
        }
        default:
          return `Removed ${subject}`;
      }

    case "resolved":
      return `Resolved issue: ${subject}`;

    case "reopened":
      return `Reopened issue: ${subject}`;
  }

  return `${activity.action} ${activity.subject_type}: ${subject}`;
}

export function formatRelativeTime(
  timestampIso: string,
  now: number = Date.now(),
): string {
  const then = new Date(timestampIso).getTime();
  if (!Number.isFinite(then)) return "";

  const diffMs = now - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const date = new Date(timestampIso);
  const nowYear = new Date(now).getFullYear();
  if (date.getFullYear() === nowYear) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Derives a display name from the actor's email local-part. We split
// on common separators (".", "_", "-") and title-case each segment so
// "mark@..." renders as "Mark" and "mark.hacz@..." as "Mark Hacz".
// Pre-auth history rows (user_email is null) render as "Anonymous".
export function activityActorName(activity: VehicleActivity): string {
  const email = activity.user_email?.trim();
  if (!email) return "Anonymous";

  const local = email.split("@")[0]?.trim();
  if (!local) return "Anonymous";

  const parts = local
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "Anonymous";

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function dayBucketLabel(
  timestampIso: string,
  now: number = Date.now(),
): string {
  const date = new Date(timestampIso);
  const nowDate = new Date(now);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  if (ymd(date) === ymd(nowDate)) return "Today";

  const yesterday = new Date(nowDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd(date) === ymd(yesterday)) return "Yesterday";

  if (date.getFullYear() === nowDate.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function groupActivitiesByDay(
  activities: VehicleActivity[],
  now: number = Date.now(),
): { label: string; activities: VehicleActivity[] }[] {
  const groups: { label: string; activities: VehicleActivity[] }[] = [];
  for (const activity of activities) {
    const label = dayBucketLabel(activity.created_at, now);
    const existing = groups[groups.length - 1];
    if (existing && existing.label === label) {
      existing.activities.push(activity);
    } else {
      groups.push({ label, activities: [activity] });
    }
  }
  return groups;
}
