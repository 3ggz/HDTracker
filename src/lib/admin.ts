// Hardcoded admin until the project grows enough to need a real
// role table. Mark is the only person who can approve new accounts
// and access /admin/* pages. To change the admin, update this
// constant *and* the hardcoded reference in
// supabase/migrations/0013_user_approvals.sql.
export const ADMIN_EMAIL = "mark@hdsecurity.systems";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL;
}
