export const ALLOWED_EMAIL_DOMAIN = "hdsecurity.systems";

export function isAllowedEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
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
