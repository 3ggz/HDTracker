-- Standing per-address allowlist alongside the @hdsecurity.systems
-- domain rule.
--
-- Nikita Fopiano works here but has no company mailbox yet, so his
-- personal address is cleared for access. This is NOT the temporary
-- dev workaround that migration 0002 added and 0008 removed — that
-- one existed to route around broken email delivery and was meant to
-- die. This one is a real person's access. A future migration that
-- restores "strict domain only" enforcement must carry this list
-- forward, and should only drop an address once that person has an
-- @hdsecurity.systems mailbox of their own.
--
-- The list lives in two places: here and ALLOWED_EMAILS in
-- src/lib/email.ts (which backs the client-side check on /signin and
-- /forgot-password). Change both at once — if only the client knows
-- about an address, this trigger rejects the signup with an opaque
-- database error.
--
-- Access still needs approval: the create_user_approval() trigger
-- files a pending row, so a new signup lands on /pending-approval
-- until an admin approves it at /admin/approvals. This migration only
-- decides who is allowed to create an account at all.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
as $$
begin
  if new.email is null then
    raise exception 'Email is required.'
      using errcode = 'check_violation';
  end if;

  -- Cleared individually: no company mailbox yet.
  if lower(new.email) in (
    'nikita.fopiano@gmail.com'
  ) then
    return new;
  end if;

  if lower(new.email) not like '%@hdsecurity.systems' then
    raise exception 'Only @HDSecurity.Systems email addresses are allowed.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
