-- Extend user_approvals with a denial state. approved_at and
-- denied_at are mutually exclusive in the app's update logic
-- (approving clears denied_at, denying clears approved_at), but
-- nothing in the schema enforces it — we don't add a CHECK because
-- doing so would clamp a useful future case (e.g. logging both
-- timestamps to track a revoke history).
--
-- This stays a soft-deny: the auth.users row remains, but the
-- proxy bounces the user to /pending-approval (where the page
-- shows a "Denied" message) until an admin re-approves them.

alter table public.user_approvals
  add column if not exists denied_at timestamptz;

alter table public.user_approvals
  add column if not exists denied_by uuid references auth.users(id) on delete set null;
