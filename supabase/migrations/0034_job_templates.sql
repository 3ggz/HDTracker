create table public.job_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.job_templates(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index job_template_items_template_id_idx
  on public.job_template_items(template_id);

alter table public.job_templates enable row level security;
alter table public.job_template_items enable row level security;

create policy "job_templates_all"
  on public.job_templates for all using (true) with check (true);
create policy "job_template_items_all"
  on public.job_template_items for all using (true) with check (true);
