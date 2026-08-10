export const ALLOWED_EMAIL_DOMAIN = "hdsecurity.systems";

// Standing exceptions: people cleared for access who don't have a
// company mailbox yet. This list is mirrored in the SQL function
// enforce_email_domain() (migration 0039) — change both together, or
// the client lets them through and the auth trigger rejects them.
const ALLOWED_EMAILS = new Set(["nikita.fopiano@gmail.com"]);

export function isAllowedEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (ALLOWED_EMAILS.has(trimmed)) return true;
  return (
    trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`) &&
    trimmed.length > ALLOWED_EMAIL_DOMAIN.length + 1
  );
}

export function firstNameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (local.length === 0) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
