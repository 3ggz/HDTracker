-- FAQ Q&A forum. Questions can have body + photos + a thread of
-- answers. One answer per question can be "pinned" (canonical),
-- stored as a nullable FK on the question pointing at the chosen
-- answer. Reuses the existing 'faq-files' storage bucket from 0021.

create table if not exists public.faq_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_by_email text,
  pinned_answer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_faq_questions_updated_at on public.faq_questions;
create trigger set_faq_questions_updated_at
  before update on public.faq_questions
  for each row
  execute function public.set_updated_at();

alter table public.faq_questions enable row level security;

drop policy if exists "Dev: anyone can read faq_questions" on public.faq_questions;
create policy "Dev: anyone can read faq_questions" on public.faq_questions
  for select using (true);

drop policy if exists "Dev: anyone can insert faq_questions" on public.faq_questions;
create policy "Dev: anyone can insert faq_questions" on public.faq_questions
  for insert with check (true);

drop policy if exists "Dev: anyone can update faq_questions" on public.faq_questions;
create policy "Dev: anyone can update faq_questions" on public.faq_questions
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete faq_questions" on public.faq_questions;
create policy "Dev: anyone can delete faq_questions" on public.faq_questions
  for delete using (true);

create table if not exists public.faq_question_photos (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.faq_questions(id) on delete cascade,
  storage_path text not null,
  position integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint faq_question_photos_storage_path_not_blank check (btrim(storage_path) <> '')
);

create index if not exists faq_question_photos_question_idx
  on public.faq_question_photos (question_id, position);

alter table public.faq_question_photos enable row level security;

drop policy if exists "Dev: anyone can read faq_question_photos" on public.faq_question_photos;
create policy "Dev: anyone can read faq_question_photos" on public.faq_question_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert faq_question_photos" on public.faq_question_photos;
create policy "Dev: anyone can insert faq_question_photos" on public.faq_question_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update faq_question_photos" on public.faq_question_photos;
create policy "Dev: anyone can update faq_question_photos" on public.faq_question_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete faq_question_photos" on public.faq_question_photos;
create policy "Dev: anyone can delete faq_question_photos" on public.faq_question_photos
  for delete using (true);

create table if not exists public.faq_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.faq_questions(id) on delete cascade,
  body text not null,
  created_by_id uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_answers_question_idx
  on public.faq_answers (question_id, created_at);

drop trigger if exists set_faq_answers_updated_at on public.faq_answers;
create trigger set_faq_answers_updated_at
  before update on public.faq_answers
  for each row
  execute function public.set_updated_at();

alter table public.faq_answers enable row level security;

drop policy if exists "Dev: anyone can read faq_answers" on public.faq_answers;
create policy "Dev: anyone can read faq_answers" on public.faq_answers
  for select using (true);

drop policy if exists "Dev: anyone can insert faq_answers" on public.faq_answers;
create policy "Dev: anyone can insert faq_answers" on public.faq_answers
  for insert with check (true);

drop policy if exists "Dev: anyone can update faq_answers" on public.faq_answers;
create policy "Dev: anyone can update faq_answers" on public.faq_answers
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete faq_answers" on public.faq_answers;
create policy "Dev: anyone can delete faq_answers" on public.faq_answers
  for delete using (true);

-- Add the FK from question.pinned_answer_id -> answer.id now that
-- both tables exist. Drop-and-add wrapped in a DO block so it's
-- idempotent on re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'faq_questions_pinned_answer_fk'
  ) then
    alter table public.faq_questions
      add constraint faq_questions_pinned_answer_fk
      foreign key (pinned_answer_id)
      references public.faq_answers(id)
      on delete set null;
  end if;
end $$;
