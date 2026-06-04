-- Widen the admin set from Mark-only to {Mark, Gio, Mike}.
--
-- Three things need updating together for the new admins to actually
-- work end-to-end:
--   1. The auto-approve branch in the create_user_approval() trigger,
--      so new admin signups land already approved and don't hit the
--      /pending-approval gate.
--   2. The select / update policies on user_approvals so the new
--      admins can see and act on everyone else's approval rows.
--   3. The matching JS list in src/lib/admin.ts (already updated in
--      this commit) — it backs isAdminEmail() which the middleware
--      and every server action consult.
--
-- The list lives in two places (SQL + JS). When changing it again,
-- update both at once.

create or replace function public.create_user_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e text;
begin
  if new.email is null then return new; end if;
  e := lower(new.email);
  insert into public.user_approvals (user_id, email, approved_at)
  values (
    new.id,
    e,
    case
      when e in (
        'mark@hdsecurity.systems',
        'gio@hdsecurity.systems',
        'mike@hdsecurity.systems'
      )
      then now()
      else null
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Backfill: if Gio or Mike already signed up before this migration
-- ran, flip their approval row to approved now so they don't sit at
-- the /pending-approval gate.
update public.user_approvals
set approved_at = now()
where lower(email) in (
        'gio@hdsecurity.systems',
        'mike@hdsecurity.systems'
      )
  and approved_at is null;

drop policy if exists "Read own approval or admin reads all" on public.user_approvals;
create policy "Read own approval or admin reads all" on public.user_approvals
  for select using (
    auth.uid() = user_id
    or auth.jwt() ->> 'email' in (
      'mark@hdsecurity.systems',
      'gio@hdsecurity.systems',
      'mike@hdsecurity.systems'
    )
  );

drop policy if exists "Admin updates approvals" on public.user_approvals;
create policy "Admin updates approvals" on public.user_approvals
  for update
  using (
    auth.jwt() ->> 'email' in (
      'mark@hdsecurity.systems',
      'gio@hdsecurity.systems',
      'mike@hdsecurity.systems'
    )
  )
  with check (
    auth.jwt() ->> 'email' in (
      'mark@hdsecurity.systems',
      'gio@hdsecurity.systems',
      'mike@hdsecurity.systems'
    )
  );
