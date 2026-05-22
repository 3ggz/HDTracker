-- Temporary dev allowlist: lets mark.hacz@gmail.com sign in for
-- development while @HDSecurity.Systems email delivery isn't set up
-- yet (Mark doesn't have DNS access for the company domain).
--
-- This replaces the enforce_email_domain() function defined in
-- 0001_enforce_email_domain.sql. The trigger itself is unchanged.
--
-- A follow-up migration will restore strict @HDSecurity.Systems-only
-- enforcement once Resend (or another SMTP provider) is wired up to
-- the company domain.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
as $$
begin
  if new.email is null then
    raise exception 'Email is required.'
      using errcode = 'check_violation';
  end if;

  -- Dev allowlist (temporary)
  if lower(new.email) = 'mark.hacz@gmail.com' then
    return new;
  end if;

  if lower(new.email) not like '%@hdsecurity.systems' then
    raise exception 'Only @HDSecurity.Systems email addresses are allowed.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
