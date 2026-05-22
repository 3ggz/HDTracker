import { describe, expect, it } from "vitest";
import {
  dayBucketLabel,
  describeVehicleActivity,
  formatRelativeTime,
  groupActivitiesByDay,
  type VehicleActivity,
} from "./vehicle-activity";

function activity(
  partial: Partial<VehicleActivity> &
    Pick<VehicleActivity, "action" | "subject_type">,
): VehicleActivity {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    vehicle_id: "00000000-0000-0000-0000-000000000001",
    action: partial.action,
    subject_type: partial.subject_type,
    subject_label: partial.subject_label ?? null,
    details: partial.details ?? null,
    user_id: partial.user_id ?? null,
    created_at: partial.created_at ?? "2026-05-22T10:00:00.000Z",
  };
}

describe("describeVehicleActivity", () => {
  it("describes added hardware with its initial quantity", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "added",
          subject_type: "hardware",
          subject_label: "Zip ties",
          details: { quantity: "50" },
        }),
      ),
    ).toBe("Added hardware: Zip ties (50)");
  });

  it("describes a quantity-only update as a diff", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "updated",
          subject_type: "tool",
          subject_label: "Hammer drill",
          details: {
            from: { name: "Hammer drill", quantity: "2" },
            to: { name: "Hammer drill", quantity: "1" },
          },
        }),
      ),
    ).toBe("Hammer drill: 2 → 1");
  });

  it("describes a rename without a quantity change", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "updated",
          subject_type: "hardware",
          subject_label: "Zip ties (small)",
          details: {
            from: { name: "Zip ties", quantity: "1 box" },
            to: { name: "Zip ties (small)", quantity: "1 box" },
          },
        }),
      ),
    ).toBe("Renamed hardware: Zip ties → Zip ties (small)");
  });

  it("describes an issue resolve and reopen", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "resolved",
          subject_type: "issue",
          subject_label: "AC compressor noisy",
        }),
      ),
    ).toBe("Resolved issue: AC compressor noisy");
    expect(
      describeVehicleActivity(
        activity({
          action: "reopened",
          subject_type: "issue",
          subject_label: "AC compressor noisy",
        }),
      ),
    ).toBe("Reopened issue: AC compressor noisy");
  });

  it("describes a removed item with its last known quantity", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "removed",
          subject_type: "hardware",
          subject_label: "Tap-cons",
          details: { last_quantity: "Has some" },
        }),
      ),
    ).toBe("Removed hardware: Tap-cons (was Has some)");
  });

  it("describes location changes and clears", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "updated",
          subject_type: "location",
          subject_label: "Marriott parking lot",
        }),
      ),
    ).toBe("Updated location: Marriott parking lot");
    expect(
      describeVehicleActivity(
        activity({ action: "updated", subject_type: "location" }),
      ),
    ).toBe("Cleared location");
  });

  it("describes vehicle creation", () => {
    expect(
      describeVehicleActivity(
        activity({
          action: "added",
          subject_type: "vehicle",
          subject_label: "Tampa Van",
        }),
      ),
    ).toBe('Created vehicle "Tampa Van"');
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 4, 22, 12, 0, 0);

  it("shows 'just now' for very recent events", () => {
    expect(formatRelativeTime(new Date(now - 10_000).toISOString(), now)).toBe(
      "just now",
    );
  });

  it("shows minutes for the first hour", () => {
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe(
      "5m ago",
    );
  });

  it("shows hours for the first day", () => {
    expect(
      formatRelativeTime(new Date(now - 3 * 60 * 60_000).toISOString(), now),
    ).toBe("3h ago");
  });

  it("shows days for the first week", () => {
    expect(
      formatRelativeTime(
        new Date(now - 4 * 24 * 60 * 60_000).toISOString(),
        now,
      ),
    ).toBe("4d ago");
  });
});

describe("groupActivitiesByDay", () => {
  it("buckets contiguous activities into Today and Yesterday", () => {
    const now = Date.UTC(2026, 4, 22, 12, 0, 0);
    const groups = groupActivitiesByDay(
      [
        activity({
          action: "added",
          subject_type: "hardware",
          subject_label: "A",
          created_at: new Date(now - 2 * 60 * 60_000).toISOString(),
        }),
        activity({
          action: "added",
          subject_type: "hardware",
          subject_label: "B",
          created_at: new Date(now - 30 * 60 * 60_000).toISOString(),
        }),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].activities.map((a) => a.subject_label)).toEqual(["A"]);
    expect(groups[1].activities.map((a) => a.subject_label)).toEqual(["B"]);
  });

  it("uses dayBucketLabel for older entries", () => {
    const now = Date.UTC(2026, 4, 22, 12, 0, 0);
    const old = Date.UTC(2026, 3, 10, 12, 0, 0);
    expect(dayBucketLabel(new Date(old).toISOString(), now)).toContain("Apr");
  });
});
