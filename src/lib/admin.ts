// Hardcoded admin set until the project grows enough to need a real
// role table. These three can approve new accounts, action password-
// reset requests, and reach every /admin/* page.
//
// Keep this list in sync with:
//   - supabase/migrations/0013_user_approvals.sql (original Mark-only)
//   - supabase/migrations/0028_more_admins.sql   (current list)
// The SQL backs the trigger that auto-approves admins on signup plus
// the RLS policies on user_approvals.
export const ADMIN_EMAILS: readonly string[] = [
  "mark@hdsecurity.systems",
  "gio@hdsecurity.systems",
  "mike@hdsecurity.systems",
];

// Original single-admin export. Kept so old call sites still compile;
// new code should prefer isAdminEmail().
export const ADMIN_EMAIL = ADMIN_EMAILS[0];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
