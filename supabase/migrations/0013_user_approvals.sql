-- One-time per-account approval gate.
--
-- New signups land in `public.user_approvals` with approved_at = null
-- and are bounced to /pending-approval by the proxy. Mark
-- (mark@hdsecurity.systems) flips their row in /admin/approvals to
-- grant access. This is intentionally a UX-level gate — RLS on the
-- app's data tables stays permissive per Mark's call. To turn this
-- into a true security boundary later, tighten those policies to
-- require an approved row.
--
-- Mark is auto-approved (both by the trigger for future signups and
-- by the backfill below for any existing row) so he can never lock
-- himself out of his own admin tools. The proxy also short-circuits
-- the check for the admin email as a belt-and-suspenders fallback.

create table if not exists public.user_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_approvals_pending_idx
  on public.user_approvals (created_at desc)
  where approved_at is null;

create or replace function public.create_user_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then return new; end if;
  insert into public.user_approvals (user_id, email, approved_at)
  values (
    new.id,
    lower(new.email),
    case when lower(new.email) = 'mark@hdsecurity.systems'
         then now()
         else null
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_user_approval_on_auth_users on auth.users;
create trigger create_user_approval_on_auth_users
  after insert on auth.users
  for each row
  execute function public.create_user_approval();

-- Backfill so users that pre-date this migration aren't stuck without
-- a row. Mark is auto-approved; every other existing account stays
-- pending so it gets vetted alongside fresh signups.
insert into public.user_approvals (user_id, email, approved_at)
select
  id,
  lower(email),
  case when lower(email) = 'mark@hdsecurity.systems' then now() else null end
from auth.users
where email is not null
on conflict (user_id) do nothing;

alter table public.user_approvals enable row level security;

drop policy if exists "Read own approval or admin reads all" on public.user_approvals;
create policy "Read own approval or admin reads all" on public.user_approvals
  for select using (
    auth.uid() = user_id
    or auth.jwt() ->> 'email' = 'mark@hdsecurity.systems'
  );

drop policy if exists "Admin updates approvals" on public.user_approvals;
create policy "Admin updates approvals" on public.user_approvals
  for update using (
    auth.jwt() ->> 'email' = 'mark@hdsecurity.systems'
  ) with check (
    auth.jwt() ->> 'email' = 'mark@hdsecurity.systems'
  );

-- The trigger writes via SECURITY DEFINER so no INSERT policy is
-- needed for app roles.

-- Add to the supabase_realtime publication so /pending-approval and
-- the admin banner can react instantly to status changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_approvals'
  ) then
    alter publication supabase_realtime add table public.user_approvals;
  end if;
end $$;
