import { describe, expect, it } from "vitest";
import { mergeConcurrentText } from "./merge-text";

describe("mergeConcurrentText", () => {
  it("returns ours when theirs is unchanged", () => {
    expect(mergeConcurrentText("a", "a\nb", "a")).toBe("a\nb");
  });

  it("returns theirs when ours is unchanged", () => {
    expect(mergeConcurrentText("a", "a", "a\nc")).toBe("a\nc");
  });

  it("returns ours when both made the same edit", () => {
    expect(mergeConcurrentText("a", "a\nb", "a\nb")).toBe("a\nb");
  });

  it("keeps both additions when both appended", () => {
    expect(
      mergeConcurrentText("Note A", "Note A\nNote C", "Note A\nNote B"),
    ).toBe("Note A\nNote B\nNote C");
  });

  it("separates appends from an empty base", () => {
    expect(mergeConcurrentText("", "my note", "their note")).toBe(
      "their note\nmy note",
    );
  });

  it("keeps their rewrite plus our appended line", () => {
    expect(
      mergeConcurrentText("old text", "old text\nour add", "rewritten"),
    ).toBe("rewritten\nour add");
  });

  it("keeps our rewrite plus their appended line", () => {
    expect(
      mergeConcurrentText("old text", "rewritten", "old text\ntheir add"),
    ).toBe("rewritten\ntheir add");
  });

  it("keeps both versions when both rewrote", () => {
    expect(mergeConcurrentText("base", "ours", "theirs")).toBe(
      "theirs\n\nours",
    );
  });

  it("inserts a newline when an append lacks one", () => {
    expect(mergeConcurrentText("a", "a tail", "a\nb")).toBe("a\nb\n tail");
  });
});
