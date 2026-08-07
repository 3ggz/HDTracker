import { describe, expect, it } from "vitest";
import {
  EXCITER_MAC_PREFIX,
  expandExciterSuffix,
  extractExciterMac,
  formatMac,
  isCompleteMac,
  isExciterMac,
  stripMac,
} from "./mac";

describe("stripMac", () => {
  it("normalizes every separator style to bare uppercase hex", () => {
    const expected = "000CCC617ABC";
    expect(stripMac("00:0c:cc:61:7a:bc")).toBe(expected);
    expect(stripMac("00-0C-CC-61-7A-BC")).toBe(expected);
    expect(stripMac("000ccc617abc")).toBe(expected);
    expect(stripMac("00 0C CC 61 7A BC")).toBe(expected);
  });
});

describe("formatMac", () => {
  it("colon-separates a complete MAC", () => {
    expect(formatMac("000CCC617ABC")).toBe("00:0C:CC:61:7A:BC");
  });

  it("leaves anything incomplete alone rather than mangling it", () => {
    expect(formatMac("000CCC")).toBe("000CCC");
    expect(formatMac("  partial ")).toBe("partial");
  });
});

describe("isCompleteMac / isExciterMac", () => {
  it("requires all twelve hex digits", () => {
    expect(isCompleteMac("00:0C:CC:61:7A:BC")).toBe(true);
    expect(isCompleteMac("00:0C:CC:61:7A")).toBe(false);
  });

  it("recognises the 5500's fixed prefix", () => {
    expect(isExciterMac("00:0C:CC:61:7A:BC")).toBe(true);
    // Right length, different vendor — not a 5500.
    expect(isExciterMac("AA:BB:CC:DD:EE:FF")).toBe(false);
  });
});

describe("expandExciterSuffix", () => {
  // A tech reading a label aloud gives the last three digits.
  it("expands three digits into a full exciter MAC", () => {
    expect(expandExciterSuffix("ABC")).toBe(`${EXCITER_MAC_PREFIX}ABC`);
    expect(expandExciterSuffix("0f2")).toBe(`${EXCITER_MAC_PREFIX}0F2`);
  });

  it("rejects anything that isn't exactly three digits", () => {
    expect(expandExciterSuffix("AB")).toBeNull();
    expect(expandExciterSuffix("ABCD")).toBeNull();
  });
});

describe("extractExciterMac", () => {
  it("reads a MAC off a typical label line", () => {
    expect(extractExciterMac("MAC: 00:0C:CC:61:7A:BC")).toEqual({
      mac: "00:0C:CC:61:7A:BC",
      matchedPrefix: true,
    });
  });

  it("handles unseparated and lowercase print", () => {
    expect(extractExciterMac("mac 000ccc6170f2")?.mac).toBe(
      "00:0C:CC:61:70:F2",
    );
  });

  it("handles dashes and stray whitespace from OCR", () => {
    expect(extractExciterMac("MAC  00-0C-CC-61-7A-BC")?.mac).toBe(
      "00:0C:CC:61:7A:BC",
    );
  });

  // The real failure mode: these labels carry a serial number that is
  // also a long hex-ish run. The known prefix has to win.
  it("prefers the exciter prefix over another hex run on the label", () => {
    const label = `
      Securitas Healthcare
      S/N 1234567890AB
      MAC: 00:0C:CC:61:7A:BC
      EX-5500
    `;
    expect(extractExciterMac(label)).toEqual({
      mac: "00:0C:CC:61:7A:BC",
      matchedPrefix: true,
    });
  });

  it("finds the MAC even when it is embedded in a longer digit run", () => {
    expect(extractExciterMac("0000CCC617ABC99")?.mac).toBe(
      "00:0C:CC:61:7A:BC",
    );
  });

  it("falls back to a labelled MAC when the prefix doesn't match", () => {
    const result = extractExciterMac("MAC: AA:BB:CC:DD:EE:FF");
    expect(result?.mac).toBe("AA:BB:CC:DD:EE:FF");
    // Flagged so the UI can ask the tech to confirm it.
    expect(result?.matchedPrefix).toBe(false);
  });

  it("returns null when there's nothing MAC-shaped", () => {
    expect(extractExciterMac("EX-5500 Exciter")).toBeNull();
    expect(extractExciterMac("")).toBeNull();
    expect(extractExciterMac("S/N 1234567890AB")).toBeNull();
  });
});
