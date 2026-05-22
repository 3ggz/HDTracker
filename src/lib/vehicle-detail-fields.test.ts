import { describe, expect, it } from "vitest";
import {
  addToQuantity,
  formatGpsLocationLabel,
  isValidCoordinatePair,
  normalizeVehicleItemDrafts,
  parseQuantityPrefix,
  parseYearInput,
  subtractFromQuantity,
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

  it("pulls a leading number out of a flexible quantity_text", () => {
    expect(parseQuantityPrefix("50")).toEqual({ number: 50, suffix: "" });
    expect(parseQuantityPrefix("50 zip ties")).toEqual({
      number: 50,
      suffix: " zip ties",
    });
    expect(parseQuantityPrefix("1 box")).toEqual({
      number: 1,
      suffix: " box",
    });
    expect(parseQuantityPrefix("Has some")).toBeNull();
    expect(parseQuantityPrefix("Well stocked")).toBeNull();
    expect(parseQuantityPrefix("")).toBeNull();
    expect(parseQuantityPrefix("   ")).toBeNull();
  });

  it("subtracts from a numeric quantity and signals remove-all at zero", () => {
    expect(subtractFromQuantity("50 zip ties", 5)).toEqual({
      kind: "updated",
      quantity_text: "45 zip ties",
    });
    expect(subtractFromQuantity("1 box", 1)).toEqual({ kind: "remove-all" });
    expect(subtractFromQuantity("5", 10)).toEqual({ kind: "remove-all" });
    expect(subtractFromQuantity("Has some", 1)).toBeNull();
    expect(subtractFromQuantity("50", 0)).toBeNull();
    expect(subtractFromQuantity("50", -1)).toBeNull();
  });

  it("depluralizes the unit when subtraction brings the count to 1", () => {
    expect(subtractFromQuantity("2 rolls", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 roll",
    });
    expect(subtractFromQuantity("2 rolls of velcro", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 roll of velcro",
    });
    expect(subtractFromQuantity("3 boxes", 2)).toEqual({
      kind: "updated",
      quantity_text: "1 box",
    });
    expect(subtractFromQuantity("2 feet", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 foot",
    });
    expect(subtractFromQuantity("2 inches", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 inch",
    });
  });

  it("keeps the plural when the count lands above 1", () => {
    expect(subtractFromQuantity("5 rolls", 1)).toEqual({
      kind: "updated",
      quantity_text: "4 rolls",
    });
    expect(subtractFromQuantity("10 boxes", 3)).toEqual({
      kind: "updated",
      quantity_text: "7 boxes",
    });
  });

  it("preserves casing when depluralizing", () => {
    expect(subtractFromQuantity("2 Rolls", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 Roll",
    });
    expect(subtractFromQuantity("2 ROLLS", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 ROLL",
    });
  });

  it("falls back to generic -es stripping for units not in the lookup", () => {
    expect(subtractFromQuantity("2 wrenches", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 wrench",
    });
    expect(subtractFromQuantity("2 batteries", 1)).toEqual({
      kind: "updated",
      quantity_text: "1 battery",
    });
  });

  it("leaves bare-number quantities alone (no suffix to depluralize)", () => {
    expect(subtractFromQuantity("2", 1)).toEqual({
      kind: "updated",
      quantity_text: "1",
    });
  });

  it("adds to a numeric quantity and pluralizes the unit when crossing 1", () => {
    expect(addToQuantity("1 roll", 1)).toEqual({
      kind: "updated",
      quantity_text: "2 rolls",
    });
    expect(addToQuantity("1 box of widgets", 2)).toEqual({
      kind: "updated",
      quantity_text: "3 boxes of widgets",
    });
    expect(addToQuantity("1 foot", 4)).toEqual({
      kind: "updated",
      quantity_text: "5 feet",
    });
    expect(addToQuantity("1 inch", 1)).toEqual({
      kind: "updated",
      quantity_text: "2 inches",
    });
    expect(addToQuantity("1 battery", 1)).toEqual({
      kind: "updated",
      quantity_text: "2 batteries",
    });
  });

  it("leaves the suffix alone when adding stays at or above 2", () => {
    expect(addToQuantity("3 rolls", 2)).toEqual({
      kind: "updated",
      quantity_text: "5 rolls",
    });
  });

  it("preserves casing when pluralizing", () => {
    expect(addToQuantity("1 Roll", 1)).toEqual({
      kind: "updated",
      quantity_text: "2 Rolls",
    });
    expect(addToQuantity("1 BOX", 1)).toEqual({
      kind: "updated",
      quantity_text: "2 BOXES",
    });
  });

  it("rejects non-numeric, zero, and negative additions", () => {
    expect(addToQuantity("Has some", 1)).toBeNull();
    expect(addToQuantity("5", 0)).toBeNull();
    expect(addToQuantity("5", -2)).toBeNull();
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
