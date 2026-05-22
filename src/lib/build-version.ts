// Short build identifier shown in the app's UI corners. On Vercel,
// `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` is set automatically; locally
// (dev / next build) it isn't, so we fall back to "dev". Truncated
// to 7 chars to match the standard short-SHA convention.
export function getBuildVersion(): string {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  if (sha && sha.length > 0) return sha.slice(0, 7);
  return "dev";
}
