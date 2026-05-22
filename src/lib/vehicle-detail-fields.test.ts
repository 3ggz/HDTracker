import { describe, expect, it } from "vitest";
import {
  formatGpsLocationLabel,
  isValidCoordinatePair,
  normalizeVehicleItemDrafts,
  parseYearInput,
  trimToNullable,
} from "./vehicle-detail-fields";

describe("vehicle detail field helpers", () => {
  it("normalizes blank text fields to null", () => {
    expect(trimToNullable("  ")).toBeNull();
    expect(trimToNullable("\n\t")).toBeNull();
    expect(trimToNullable(" Marriott parking lot ")).toBe(
      "Marriott parking lot",
    );
  });

  it("formats GPS labels consistently for technicians", () => {
    expect(formatGpsLocationLabel(27.950575, -82.457176)).toBe(
      "GPS: 27.95058, -82.45718",
    );
  });

  it("accepts only real latitude and longitude pairs", () => {
    expect(isValidCoordinatePair(90, 180)).toBe(true);
    expect(isValidCoordinatePair(-90, -180)).toBe(true);
    expect(isValidCoordinatePair(90.1, 0)).toBe(false);
    expect(isValidCoordinatePair(0, -180.1)).toBe(false);
    expect(isValidCoordinatePair(Number.NaN, 0)).toBe(false);
  });

  it("parses year inputs into the realistic vehicle range", () => {
    expect(parseYearInput("")).toBeNull();
    expect(parseYearInput("   ")).toBeNull();
    expect(parseYearInput("2021")).toBe(2021);
    expect(parseYearInput(" 1999 ")).toBe(1999);
    expect(parseYearInput("not a year")).toBeNull();
    expect(parseYearInput("1850")).toBeNull();
    expect(parseYearInput("3000")).toBeNull();
  });

  it("normalizes item drafts while keeping flexible quantities", () => {
    expect(
      normalizeVehicleItemDrafts([
        { id: "existing", name: " Zip ties ", quantity_text: " 1 box " },
        { id: "blank", name: "   ", quantity_text: "ignored" },
        { name: "Drill", quantity_text: " " },
      ]),
    ).toEqual([
      { id: "existing", name: "Zip ties", quantity_text: "1 box" },
      { name: "Drill", quantity_text: "Has some" },
    ]);
  });
});
