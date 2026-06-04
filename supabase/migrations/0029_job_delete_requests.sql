-- Non-admin "delete this job" requests. Path:
--   1. A non-admin taps "Delete (pending authorization)" on
--      /jobs/[id]. A row lands here with resolved_at = null.
--   2. Admins see it under "Job deletion requests" in
--      /admin/approvals.
--   3. Approve → the job is hard-deleted (cascading through doors /
--      items / photos / panels / annotations) and the row is
--      stamped resolved_at + resolved_action = 'approved'.
--   4. Deny → the row is stamped resolved_action = 'denied'. The
--      job stays put.
--
-- We snapshot the job's name + number into the request so the admin
-- page can show "Delete Acme HQ (#1234)?" even after the row in
-- jobs is gone. The job_id FK uses ON DELETE SET NULL so an
-- approved request still has its history after the cascade fires.
--
-- RLS is permissive (matches the rest of the schema). Real gates
-- live in the server actions via isAdminEmail() + the
-- requested_by snapshot.

create table if not exists public.job_delete_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  job_name text not null,
  job_number text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_email text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_action text check (resolved_action in ('approved', 'denied'))
);

create index if not exists job_delete_requests_pending_idx
  on public.job_delete_requests (requested_at desc)
  where resolved_at is null;

create index if not exists job_delete_requests_job_idx
  on public.job_delete_requests (job_id);

alter table public.job_delete_requests enable row level security;

drop policy if exists "permissive" on public.job_delete_requests;
create policy "permissive" on public.job_delete_requests
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_delete_requests'
  ) then
    alter publication supabase_realtime add table public.job_delete_requests;
  end if;
end $$;
