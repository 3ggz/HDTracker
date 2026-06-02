-- FAQ / knowledge base: titles + body + multiple photos per entry.
-- Designed as "good bones" for future expansion (categories, search,
-- drag-to-reorder, etc) — the schema reserves `position` for sort
-- order, RLS is permissive matching the rest of the app, and the
-- updated_at trigger uses the existing set_updated_at function.

create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_faq_entries_updated_at on public.faq_entries;
create trigger set_faq_entries_updated_at
  before update on public.faq_entries
  for each row
  execute function public.set_updated_at();

alter table public.faq_entries enable row level security;

drop policy if exists "Dev: anyone can read faq_entries" on public.faq_entries;
create policy "Dev: anyone can read faq_entries" on public.faq_entries
  for select using (true);

drop policy if exists "Dev: anyone can insert faq_entries" on public.faq_entries;
create policy "Dev: anyone can insert faq_entries" on public.faq_entries
  for insert with check (true);

drop policy if exists "Dev: anyone can update faq_entries" on public.faq_entries;
create policy "Dev: anyone can update faq_entries" on public.faq_entries
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete faq_entries" on public.faq_entries;
create policy "Dev: anyone can delete faq_entries" on public.faq_entries
  for delete using (true);

create table if not exists public.faq_photos (
  id uuid primary key default gen_random_uuid(),
  faq_entry_id uuid not null references public.faq_entries(id) on delete cascade,
  storage_path text not null,
  caption text,
  position integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint faq_photos_storage_path_not_blank check (btrim(storage_path) <> '')
);

create index if not exists faq_photos_entry_idx
  on public.faq_photos (faq_entry_id, position);

alter table public.faq_photos enable row level security;

drop policy if exists "Dev: anyone can read faq_photos" on public.faq_photos;
create policy "Dev: anyone can read faq_photos" on public.faq_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert faq_photos" on public.faq_photos;
create policy "Dev: anyone can insert faq_photos" on public.faq_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update faq_photos" on public.faq_photos;
create policy "Dev: anyone can update faq_photos" on public.faq_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete faq_photos" on public.faq_photos;
create policy "Dev: anyone can delete faq_photos" on public.faq_photos
  for delete using (true);

-- Storage bucket for FAQ photos. Public so the UI can use direct
-- public URLs (matches vehicle-photos / job-files).
insert into storage.buckets (id, name, public)
values ('faq-files', 'faq-files', true)
on conflict (id) do nothing;

drop policy if exists "Dev: anyone can read faq files" on storage.objects;
create policy "Dev: anyone can read faq files"
  on storage.objects for select
  using (bucket_id = 'faq-files');

drop policy if exists "Dev: anyone can upload faq files" on storage.objects;
create policy "Dev: anyone can upload faq files"
  on storage.objects for insert
  with check (bucket_id = 'faq-files');

drop policy if exists "Dev: anyone can update faq files" on storage.objects;
create policy "Dev: anyone can update faq files"
  on storage.objects for update
  using (bucket_id = 'faq-files')
  with check (bucket_id = 'faq-files');

drop policy if exists "Dev: anyone can delete faq files" on storage.objects;
create policy "Dev: anyone can delete faq files"
  on storage.objects for delete
  using (bucket_id = 'faq-files');
