-- Very temporary admin-mediated password reset, in place until SMTP
-- for @hdsecurity.systems is working and Supabase can send the
-- standard reset emails. Workflow:
--
--   1. User submits their email at /forgot-password — a row lands here
--      with approved_at and fulfilled_at both null.
--   2. Mark sees the pending row at /admin/resets and clicks Approve.
--   3. The user's /forgot-password/status page (subscribed via realtime)
--      sees approved_at flip to a timestamp and reveals a new-password
--      field. On submit, a server action with the service-role key
--      updates auth.users.password and stamps fulfilled_at = now().
--
-- RLS stays permissive across the board: the pre-login request form
-- has no auth.uid() yet, so a restricted policy can't write the row,
-- and the user later needs to read their own row from the same
-- anonymous session. Approvals are gated server-side via
-- isAdminEmail() in the server action.

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  fulfilled_at timestamptz
);

create index if not exists password_reset_requests_email_idx
  on public.password_reset_requests (email, requested_at desc);

create index if not exists password_reset_requests_pending_idx
  on public.password_reset_requests (requested_at desc)
  where approved_at is null;

alter table public.password_reset_requests enable row level security;

drop policy if exists "permissive" on public.password_reset_requests;
create policy "permissive" on public.password_reset_requests
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'password_reset_requests'
  ) then
    alter publication supabase_realtime add table public.password_reset_requests;
  end if;
end $$;
