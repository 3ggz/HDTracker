import { describe, expect, it } from "vitest";
import { compareDoorNames } from "./jobs";

describe("compareDoorNames", () => {
  it("sorts pure numeric order within a letter prefix", () => {
    const sorted = ["D10", "D1", "D9", "D2"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D2", "D9", "D10"]);
  });

  it("groups by letter prefix", () => {
    const sorted = ["E101", "D9", "E105", "D11"].sort(compareDoorNames);
    expect(sorted).toEqual(["D9", "D11", "E101", "E105"]);
  });

  it("is case-insensitive for the letter prefix", () => {
    const sorted = ["d10", "D1", "D9"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D9", "d10"]);
  });

  it("handles three-letter prefixes", () => {
    const sorted = ["SX", "SW", "ST", "SB"].sort(compareDoorNames);
    expect(sorted).toEqual(["SB", "ST", "SW", "SX"]);
  });

  it("mixes letter-only and letter+number labels", () => {
    const sorted = ["SX", "D9", "ST", "D1"].sort(compareDoorNames);
    expect(sorted).toEqual(["D1", "D9", "ST", "SX"]);
  });

  it("breaks long mixed lists into natural order", () => {
    const input = [
      "E113",
      "D11",
      "E105",
      "D9",
      "E101",
      "D15",
      "E108",
      "D1",
      "D16",
      "SX",
      "SW",
    ];
    const sorted = [...input].sort(compareDoorNames);
    expect(sorted).toEqual([
      "D1",
      "D9",
      "D11",
      "D15",
      "D16",
      "E101",
      "E105",
      "E108",
      "E113",
      "SW",
      "SX",
    ]);
  });
});
