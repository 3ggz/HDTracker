import { describe, expect, it } from "vitest";
import { collectFloors, isFloorDirty, normalizeFloor } from "./floors";

describe("normalizeFloor", () => {
  it("treats blank and whitespace as no floor", () => {
    expect(normalizeFloor("")).toBeNull();
    expect(normalizeFloor("   ")).toBeNull();
  });

  it("trims a typed floor", () => {
    expect(normalizeFloor("  Roof ")).toBe("Roof");
  });

  it("keeps free-text floors intact", () => {
    expect(normalizeFloor("Mother-Baby Floor")).toBe("Mother-Baby Floor");
  });
});

describe("isFloorDirty", () => {
  it("is clean when nothing changed", () => {
    expect(isFloorDirty("Floor 2", "Floor 2")).toBe(false);
    expect(isFloorDirty("", null)).toBe(false);
    expect(isFloorDirty("  Floor 2  ", "Floor 2")).toBe(false);
  });

  // Clearing has to be savable or gear could be moved onto a floor
  // but never back off it.
  it("is dirty when clearing an assigned floor", () => {
    expect(isFloorDirty("", "Floor 2")).toBe(true);
  });

  it("is dirty when assigning a floor for the first time", () => {
    expect(isFloorDirty("Roof", null)).toBe(true);
  });
});

describe("collectFloors", () => {
  it("dedupes and sorts floors naturally", () => {
    expect(
      collectFloors([
        { floor: "Floor 10" },
        { floor: "Floor 2" },
        { floor: "Floor 2" },
        { floor: "Floor 1" },
      ]),
    ).toEqual(["Floor 1", "Floor 2", "Floor 10"]);
  });

  it("ignores null and blank floors", () => {
    expect(
      collectFloors([{ floor: null }, { floor: "  " }, { floor: "Roof" }]),
    ).toEqual(["Roof"]);
  });

  it("trims before deduping so spacing doesn't split a floor in two", () => {
    expect(collectFloors([{ floor: "Roof" }, { floor: " Roof " }])).toEqual([
      "Roof",
    ]);
  });

  it("returns nothing for a job with no floors", () => {
    expect(collectFloors([{ floor: null }])).toEqual([]);
  });
});
