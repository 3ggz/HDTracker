import { describe, expect, it } from "vitest";
import { isRenderableEverywhere, looksLikeHeic } from "./image-normalize";

describe("isRenderableEverywhere", () => {
  it("accepts the formats every phone on the crew can display", () => {
    for (const type of [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ]) {
      expect(isRenderableEverywhere(type)).toBe(true);
    }
  });

  // The whole bug: Android shows a broken image icon for these, so
  // they must never be treated as safe to store.
  it("rejects HEIC and HEIF", () => {
    expect(isRenderableEverywhere("image/heic")).toBe(false);
    expect(isRenderableEverywhere("image/heif")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isRenderableEverywhere("IMAGE/JPEG")).toBe(true);
  });

  it("rejects an empty or unknown type", () => {
    expect(isRenderableEverywhere("")).toBe(false);
    expect(isRenderableEverywhere("application/octet-stream")).toBe(false);
  });
});

describe("looksLikeHeic", () => {
  it("detects HEIC by mime type", () => {
    expect(looksLikeHeic({ name: "blob", type: "image/heic" })).toBe(true);
    expect(looksLikeHeic({ name: "blob", type: "image/HEIF" })).toBe(true);
  });

  // Android pickers routinely report no type, or octet-stream, for a
  // HEIC. Without the filename check those uploads look like ordinary
  // unknown blobs.
  it("detects HEIC by filename when the picker gave no usable type", () => {
    expect(looksLikeHeic({ name: "IMG_0042.HEIC", type: "" })).toBe(true);
    expect(
      looksLikeHeic({
        name: "IMG_0042.heif",
        type: "application/octet-stream",
      }),
    ).toBe(true);
  });

  it("leaves ordinary photos alone", () => {
    expect(looksLikeHeic({ name: "IMG_0042.jpg", type: "image/jpeg" })).toBe(
      false,
    );
    expect(looksLikeHeic({ name: "diagram.png", type: "image/png" })).toBe(
      false,
    );
  });

  // "heic" inside the stem is not an extension.
  it("doesn't match on a filename that merely contains heic", () => {
    expect(looksLikeHeic({ name: "heic-notes.jpg", type: "image/jpeg" })).toBe(
      false,
    );
  });
});
