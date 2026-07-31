import { describe, expect, it } from "vitest";
import {
  isRenderableEverywhere,
  looksLikeHeic,
  needsConversion,
  sniffImageKind,
} from "./image-normalize";

const bytes = (...parts: (number | string)[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") out.push(p);
    else for (const ch of p) out.push(ch.charCodeAt(0));
  }
  return new Uint8Array(out);
};

describe("sniffImageKind", () => {
  it("identifies the formats that render everywhere", () => {
    expect(sniffImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImageKind(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "png",
    );
    expect(sniffImageKind(bytes("GIF89a"))).toBe("gif");
    expect(sniffImageKind(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("webp");
  });

  // The whole point of the backfill: find these regardless of what the
  // filename or the stored content type claims.
  it("identifies HEIC by its ISO-BMFF brand", () => {
    for (const brand of ["heic", "heix", "mif1", "msf1"]) {
      expect(sniffImageKind(bytes(0, 0, 0, 0x18, "ftyp", brand))).toBe("heif");
    }
  });

  it("tells AVIF apart from HEIC so it isn't needlessly re-encoded", () => {
    expect(sniffImageKind(bytes(0, 0, 0, 0x18, "ftyp", "avif"))).toBe("avif");
  });

  it("returns unknown for junk or a truncated read", () => {
    expect(sniffImageKind(bytes(1, 2, 3, 4, 5, 6, 7, 8))).toBe("unknown");
    expect(sniffImageKind(bytes(0xff))).toBe("unknown");
    expect(sniffImageKind(new Uint8Array())).toBe("unknown");
  });
});

describe("needsConversion", () => {
  it("converts HEIC and anything unrecognised, leaves the rest", () => {
    expect(needsConversion("heif")).toBe(true);
    expect(needsConversion("unknown")).toBe(true);
    for (const kind of ["jpeg", "png", "gif", "webp", "avif"] as const) {
      expect(needsConversion(kind)).toBe(false);
    }
  });
});

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
