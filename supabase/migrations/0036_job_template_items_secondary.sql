alter table public.job_template_items
  add column if not exists is_secondary boolean not null default false;
