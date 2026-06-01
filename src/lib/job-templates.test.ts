import { describe, expect, it } from "vitest";
import { HUGS_TEMPLATE, JOB_TEMPLATES, getTemplate } from "./job-templates";

describe("HUGS template", () => {
  it("pre-fills the three always-needed items", () => {
    expect(HUGS_TEMPLATE.requiredItems).toEqual([
      "5500 Exciter",
      "Strobe",
      "HUGS 8 board",
    ]);
  });

  it("lists the three optional items as quick-adds", () => {
    expect(HUGS_TEMPLATE.optionalItems).toEqual([
      "5200 Exciter",
      "4210 Antenna",
      "3220 Exciter",
    ]);
  });

  it("doesn't double-list any item between required and optional", () => {
    const overlap = HUGS_TEMPLATE.requiredItems.filter((r) =>
      HUGS_TEMPLATE.optionalItems.includes(r),
    );
    expect(overlap).toEqual([]);
  });
});

describe("getTemplate", () => {
  it("finds HUGS by id", () => {
    expect(getTemplate("hugs")).toBe(HUGS_TEMPLATE);
  });

  it("returns undefined for unknown ids", () => {
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("exposes HUGS in the registry", () => {
    expect(JOB_TEMPLATES).toContain(HUGS_TEMPLATE);
  });
});
