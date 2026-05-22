-- Two related changes for the password-based sign-in flow:
--
-- 1. A `known_emails` mirror of `auth.users.email` so the sign-in
--    page can ask "is this email already registered?" without a
--    server round-trip and without exposing the full auth.users
--    table to the anon role. The mirror is maintained by triggers
--    that fire on insert / update / delete of auth.users — there's
--    no app-level code path that writes to it.
--
-- 2. Reverts the @hdsecurity.systems email-domain enforcement to
--    strict (drops the mark.hacz@gmail.com dev allowlist from
--    migration 0002). Now that auth uses passwords instead of
--    magic links, there's no delivery problem to work around.

-- known_emails table -----------------------------------------------------

create table if not exists public.known_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.known_emails enable row level security;

drop policy if exists "Anyone can check known emails" on public.known_emails;
create policy "Anyone can check known emails" on public.known_emails
  for select using (true);

-- No insert / update / delete policies for the anon or authenticated roles.
-- The triggers below run as SECURITY DEFINER and bypass RLS to maintain
-- this table; the app never writes here directly.

create or replace function public.track_known_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then return new; end if;
  insert into public.known_emails (email)
  values (lower(new.email))
  on conflict (email) do nothing;
  return new;
end;
$$;

create or replace function public.retrack_known_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email is distinct from new.email then
    if old.email is not null then
      delete from public.known_emails where email = lower(old.email);
    end if;
    if new.email is not null then
      insert into public.known_emails (email)
      values (lower(new.email))
      on conflict (email) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.untrack_known_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email is not null then
    delete from public.known_emails where email = lower(old.email);
  end if;
  return old;
end;
$$;

drop trigger if exists track_known_email_on_auth_users on auth.users;
create trigger track_known_email_on_auth_users
  after insert on auth.users
  for each row
  execute function public.track_known_email();

drop trigger if exists retrack_known_email_on_auth_users on auth.users;
create trigger retrack_known_email_on_auth_users
  after update of email on auth.users
  for each row
  execute function public.retrack_known_email();

drop trigger if exists untrack_known_email_on_auth_users on auth.users;
create trigger untrack_known_email_on_auth_users
  after delete on auth.users
  for each row
  execute function public.untrack_known_email();

-- Backfill any users that exist before the trigger was installed.
insert into public.known_emails (email)
select lower(email) from auth.users where email is not null
on conflict (email) do nothing;

-- Strict @hdsecurity.systems enforcement (drops the dev allowlist) ------

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
as $$
begin
  if new.email is null then
    raise exception 'Email is required.'
      using errcode = 'check_violation';
  end if;

  if lower(new.email) not like '%@hdsecurity.systems' then
    raise exception 'Only @HDSecurity.Systems email addresses are allowed.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
