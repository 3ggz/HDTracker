// Three-way merge for a plain-text field edited concurrently by two
// people. `base` is the value both editors started from, `ours` is
// what this client wants to save, `theirs` is what the database holds
// now. Pure append-style edits (the common "each tech adds a line"
// case) merge losslessly; genuine rewrites keep both versions rather
// than silently dropping one.
export function mergeConcurrentText(
  base: string,
  ours: string,
  theirs: string,
): string {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  const oursAdd = ours.startsWith(base) ? ours.slice(base.length) : null;
  const theirsAdd = theirs.startsWith(base) ? theirs.slice(base.length) : null;
  if (oursAdd !== null && theirsAdd !== null) {
    return joinWithNewline(base + theirsAdd, oursAdd);
  }
  if (oursAdd !== null) return joinWithNewline(theirs, oursAdd);
  if (theirsAdd !== null) return joinWithNewline(ours, theirsAdd);
  return theirs + "\n\n" + ours;
}

function joinWithNewline(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith("\n") || b.startsWith("\n")) return a + b;
  return a + "\n" + b;
}
