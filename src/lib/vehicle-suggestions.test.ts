import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUANTITY_OPTIONS,
  buildVehicleItemSuggestions,
} from "./vehicle-suggestions";

describe("buildVehicleItemSuggestions", () => {
  it("returns the default quantity options when no items exist", () => {
    const result = buildVehicleItemSuggestions([]);
    expect(result.hardwareNames).toEqual([]);
    expect(result.toolNames).toEqual([]);
    expect(result.quantities).toEqual([...DEFAULT_QUANTITY_OPTIONS].sort());
  });

  it("scopes name suggestions per category", () => {
    const result = buildVehicleItemSuggestions([
      { category: "hardware", name: "Zip ties", quantity_text: "1 box" },
      { category: "hardware", name: "Beanies", quantity_text: "1 pack" },
      { category: "tool", name: "Hammer drill", quantity_text: "1" },
    ]);
    expect(result.hardwareNames).toEqual(["Beanies", "Zip ties"]);
    expect(result.toolNames).toEqual(["Hammer drill"]);
  });

  it("dedupes user quantities against the defaults", () => {
    const result = buildVehicleItemSuggestions([
      { category: "hardware", name: "X", quantity_text: "Has some" },
      { category: "tool", name: "Y", quantity_text: "1 roll" },
      { category: "hardware", name: "Z", quantity_text: "1 roll" },
    ]);
    expect(result.quantities).toEqual([
      "1 roll",
      "Has some",
      "Low stock",
      "None",
      "Well stocked",
    ]);
  });

  it("trims whitespace and skips blank values", () => {
    const result = buildVehicleItemSuggestions([
      { category: "hardware", name: "  Zip ties  ", quantity_text: " 1 box " },
      { category: "hardware", name: "   ", quantity_text: "" },
      { category: "tool", name: "", quantity_text: "1" },
    ]);
    expect(result.hardwareNames).toEqual(["Zip ties"]);
    expect(result.toolNames).toEqual([]);
    expect(result.quantities).toContain("1 box");
    expect(result.quantities).toContain("1");
  });

  it("sorts names case-insensitively", () => {
    const result = buildVehicleItemSuggestions([
      { category: "hardware", name: "zip ties", quantity_text: "1" },
      { category: "hardware", name: "Beanies", quantity_text: "1" },
      { category: "hardware", name: "tap-cons", quantity_text: "1" },
    ]);
    expect(result.hardwareNames).toEqual(["Beanies", "tap-cons", "zip ties"]);
  });
});
