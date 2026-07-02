alter table public.job_door_items
  add column if not exists ip_address text,
  add column if not exists mac_address text;

alter table public.jobs
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists jobs_share_token_idx
  on public.jobs(share_token);
