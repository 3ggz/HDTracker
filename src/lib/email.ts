export const ALLOWED_EMAIL_DOMAIN = "hdsecurity.systems";

// Temporary dev allowlist. Mark doesn't yet have DNS access for the
// @HDSecurity.Systems mail server, so its inbox isn't reachable during
// development. Remove this set (and the matching SQL migration) once
// the company-domain mailbox is configured with Resend or similar.
const DEV_EMAIL_ALLOWLIST = new Set<string>(["mark.hacz@gmail.com"]);

export function isAllowedEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (DEV_EMAIL_ALLOWLIST.has(trimmed)) return true;
  return trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`) && trimmed.length > ALLOWED_EMAIL_DOMAIN.length + 1;
}

export function firstNameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (local.length === 0) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
