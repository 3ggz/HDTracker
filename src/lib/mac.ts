// 5500 exciters all ship with the same OUI + product prefix, so only
// the last three hex digits actually differ between units. That
// constraint is what makes reading one off a photo reliable: nine of
// the twelve characters are known before we start, so a misread there
// is a correctable error rather than a wrong MAC.

export const EXCITER_MAC_PREFIX = "000CCC617";
const MAC_LENGTH = 12;

// Strip separators and casing so "00:0c:cc:61:7a:bc", "000CCC617ABC"
// and "00-0C-CC-61-7A-BC" all compare equal.
export function stripMac(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

// Bare uppercase hex, no separators — the same form printed on the
// device and box labels ("MAC: 000CCC617AB6"), so a scanned value and
// a hand-typed one look identical in the list and in the exports.
export function formatMac(raw: string): string {
  const hex = stripMac(raw);
  if (hex.length !== MAC_LENGTH) return raw.trim();
  return hex;
}

export function isCompleteMac(raw: string): boolean {
  return stripMac(raw).length === MAC_LENGTH;
}

export function isExciterMac(raw: string): boolean {
  const hex = stripMac(raw);
  return hex.length === MAC_LENGTH && hex.startsWith(EXCITER_MAC_PREFIX);
}

// A tech reading a label out loud gives the last three digits, so
// accept those alone and expand them.
export function expandExciterSuffix(raw: string): string | null {
  const hex = stripMac(raw);
  if (hex.length !== MAC_LENGTH - EXCITER_MAC_PREFIX.length) return null;
  return EXCITER_MAC_PREFIX + hex;
}

export type MacScanResult = {
  mac: string;
  matchedPrefix: boolean;
};

// Pull a 5500's MAC out of whatever text came back from OCR.
//
// Deliberately not a single regex over the raw string: labels wrap,
// and separators are inconsistent between print runs. Candidates are
// gathered from the de-punctuated text, then ranked — a value with
// the known exciter prefix always wins over a bare 12-hex run, which
// on these labels is as likely to be a serial number.
export function extractExciterMac(text: string): MacScanResult | null {
  if (!text) return null;
  const upper = text.toUpperCase();

  // Anything hex-ish with optional separators, long enough to matter.
  const candidates: string[] = [];
  const runs = upper.match(/[0-9A-F][0-9A-F:.\-\s]{8,}[0-9A-F]/g) ?? [];
  for (const run of runs) {
    const hex = stripMac(run);
    // A run can carry a MAC plus trailing digits from the next field;
    // slide a window rather than discarding it.
    for (let i = 0; i + MAC_LENGTH <= hex.length; i++) {
      candidates.push(hex.slice(i, i + MAC_LENGTH));
    }
  }

  const withPrefix = candidates.find((c) => c.startsWith(EXCITER_MAC_PREFIX));
  if (withPrefix) return { mac: formatMac(withPrefix), matchedPrefix: true };

  // No prefix match. Fall back to a value explicitly labelled MAC, so
  // a serial number elsewhere on the label doesn't get picked up.
  const labelled = upper.match(
    /MAC[^0-9A-F]{0,12}((?:[0-9A-F]{2}[:.\-\s]?){6})/,
  );
  if (labelled) {
    const hex = stripMac(labelled[1]);
    if (hex.length === MAC_LENGTH) {
      return { mac: formatMac(hex), matchedPrefix: false };
    }
  }

  return null;
}
