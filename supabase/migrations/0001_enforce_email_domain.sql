-- Enforce that only @hdsecurity.systems email addresses can sign up
-- or update their email. Runs as a BEFORE INSERT OR UPDATE trigger
-- on auth.users; raises an exception when the domain doesn't match.
--
-- This is the server-side counterpart to the client-side check in
-- src/lib/email.ts — so the rule can't be bypassed by hitting the
-- Supabase auth API directly.

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

drop trigger if exists enforce_email_domain_on_auth_users on auth.users;

create trigger enforce_email_domain_on_auth_users
  before insert or update of email on auth.users
  for each row
  execute function public.enforce_email_domain();
