alter table public.job_doors
  add column if not exists template_id uuid
    references public.job_templates(id) on delete set null;

create index if not exists job_doors_template_id_idx
  on public.job_doors(template_id);
