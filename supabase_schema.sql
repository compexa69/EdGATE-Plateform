-- ============================================================
-- EdTech Platform — Complete Supabase Schema (v3 — final)
-- Run this entire script once in:
--   Supabase Dashboard → SQL Editor → New query → Run
--
-- Fully idempotent: safe to re-run at any time.
-- All tables, enums, triggers, RLS policies, and indexes included.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. ENUMS
-- ============================================================
do $$ begin create type user_role as enum ('super_admin', 'admin', 'student');
exception when duplicate_object then null; end $$;

do $$ begin create type user_status as enum ('pending_approval', 'approved', 'suspended', 'banned');
exception when duplicate_object then null; end $$;

do $$ begin create type exam_type as enum ('lecture_quiz', 'dpp', 'pyq', 'topic_test', 'chapter_test', 'subject_test', 'grand_test', 'drill');
exception when duplicate_object then null; end $$;

do $$ begin create type attempt_status as enum ('in_progress', 'paused', 'submitted', 'auto_submitted');
exception when duplicate_object then null; end $$;

do $$ begin create type difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin create type task_status as enum ('pending', 'in_progress', 'completed', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin create type task_source as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin create type external_exam_type as enum ('jee_main', 'jee_advanced', 'neet', 'gate', 'bitsat', 'viteee', 'other');
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2. SHARED TRIGGER: auto-update updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Helper macro to attach the trigger (idempotent)
-- Usage: called inline per table with DO blocks below.

-- ============================================================
-- 3. USERS
-- Mirrors auth.users. Supabase Auth owns passwords, email
-- verification, and password-reset — not stored here.
-- First registered user → super_admin + approved automatically.
-- ============================================================
create table if not exists public.users (
  id                     text primary key,
  full_name              text not null default '',
  email                  text not null unique,
  mobile                 text not null default '',
  role                   user_role    not null default 'student',
  status                 user_status  not null default 'pending_approval',
  email_verified         boolean      not null default false,
  email_change_token     text,
  email_change_new_email text,
  email_change_expiry    timestamptz,
  photo_b2_key           text,
  last_login_at          timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now()
);
do $$ begin
  create trigger users_updated_at before update on public.users
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- Auto-create public profile row when a Supabase auth user signs up
create or replace function public.handle_new_auth_user()
returns trigger as $$
declare
  user_count integer;
begin
  select count(*) into user_count from public.users where deleted_at is null;
  insert into public.users (id, full_name, email, mobile, role, status, email_verified)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'mobile', ''),
    case when user_count = 0 then 'super_admin'::user_role else 'student'::user_role end,
    case when user_count = 0 then 'approved'::user_status else 'pending_approval'::user_status end,
    coalesce(new.email_confirmed_at is not null, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Sync email_verified when user confirms email in Supabase Auth
create or replace function public.handle_auth_user_updated()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.users
    set email_verified = true
    where id::text = new.id::text;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_auth_user_updated();

-- ============================================================
-- 4. SUBJECTS
-- ============================================================
create table if not exists public.subjects (
  id          text primary key default ('sub_' || replace(gen_random_uuid()::text, '-', '')),
  name        text    not null,
  description text,
  "order"     integer not null default 0,
  icon_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
do $$ begin
  create trigger subjects_updated_at before update on public.subjects
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 5. CHAPTERS
-- ============================================================
create table if not exists public.chapters (
  id          text primary key default ('chp_' || replace(gen_random_uuid()::text, '-', '')),
  subject_id  text    not null references public.subjects(id) on delete cascade,
  name        text    not null,
  description text,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
do $$ begin
  create trigger chapters_updated_at before update on public.chapters
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 6. TOPICS
-- ============================================================
create table if not exists public.topics (
  id                  text primary key default ('top_' || replace(gen_random_uuid()::text, '-', '')),
  chapter_id          text    not null references public.chapters(id) on delete cascade,
  name                text    not null,
  description         text,
  "order"             integer not null default 0,
  telegram_chat_id    text,
  telegram_message_id text,
  telegram_url        text,
  youtube_url         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
do $$ begin
  create trigger topics_updated_at before update on public.topics
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 7. QUESTIONS
-- ============================================================
create table if not exists public.questions (
  id             text       primary key default ('q_' || replace(gen_random_uuid()::text, '-', '')),
  topic_id       text       references public.topics(id) on delete set null,
  text           text       not null,
  options        text[]     not null,
  correct_option text       not null,
  marks          real       not null default 4,
  image_url      text,
  text_solution  text,
  video_url      text,
  qr_code_svg    text,
  difficulty     difficulty not null default 'medium',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
do $$ begin
  create trigger questions_updated_at before update on public.questions
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 8. EXAMS
-- ============================================================
create table if not exists public.exams (
  id               text      primary key default ('exam_' || replace(gen_random_uuid()::text, '-', '')),
  title            text      not null,
  type             exam_type not null,
  subject_id       text      references public.subjects(id) on delete set null,
  chapter_id       text      references public.chapters(id) on delete set null,
  topic_id         text      references public.topics(id) on delete set null,
  duration_minutes integer   not null default 60,
  passing_score    integer,
  negative_marking real      not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
do $$ begin
  create trigger exams_updated_at before update on public.exams
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 9. EXAM QUESTIONS (junction)
-- ============================================================
create table if not exists public.exam_questions (
  id          text primary key default ('eq_' || replace(gen_random_uuid()::text, '-', '')),
  exam_id     text    not null references public.exams(id) on delete cascade,
  question_id text    not null references public.questions(id) on delete cascade,
  "order"     integer not null default 0,
  unique (exam_id, question_id)
);

-- ============================================================
-- 10. EXAM ATTEMPTS
-- ============================================================
create table if not exists public.exam_attempts (
  id                text           primary key default ('att_' || replace(gen_random_uuid()::text, '-', '')),
  user_id           text           not null references public.users(id) on delete cascade,
  exam_id           text           not null references public.exams(id) on delete cascade,
  status            attempt_status not null default 'in_progress',
  start_time        timestamptz    not null default now(),
  end_time          timestamptz,
  pause_count       integer        not null default 0,
  remaining_seconds integer        not null default 3600,
  resumed_at        timestamptz,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now()
);
do $$ begin
  create trigger exam_attempts_updated_at before update on public.exam_attempts
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 11. ATTEMPT ANSWERS
-- ============================================================
create table if not exists public.attempt_answers (
  id                   text primary key default ('ans_' || replace(gen_random_uuid()::text, '-', '')),
  attempt_id           text    not null references public.exam_attempts(id) on delete cascade,
  question_id          text    not null,
  selected_option      text,
  is_marked_for_review boolean not null default false,
  time_spent_seconds   integer not null default 0,
  updated_at           timestamptz not null default now()
);
do $$ begin
  create trigger attempt_answers_updated_at before update on public.attempt_answers
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 12. EXAM RESULTS
-- ============================================================
create table if not exists public.exam_results (
  id                 text primary key default ('res_' || replace(gen_random_uuid()::text, '-', '')),
  attempt_id         text  not null references public.exam_attempts(id) on delete cascade,
  user_id            text  not null references public.users(id) on delete cascade,
  exam_id            text  not null references public.exams(id) on delete cascade,
  score              real  not null default 0,
  max_score          real  not null default 0,
  accuracy           real  not null default 0,
  total_questions    integer not null default 0,
  correct_answers    integer not null default 0,
  incorrect_answers  integer not null default 0,
  skipped_answers    integer not null default 0,
  time_taken_seconds integer not null default 0,
  passed             boolean not null default false,
  submitted_at       timestamptz not null default now()
);

-- ============================================================
-- 13. TOPIC PROGRESS  (SRS gating state per user per topic)
-- ============================================================
create table if not exists public.topic_progress (
  id                  text primary key default ('tp_' || replace(gen_random_uuid()::text, '-', '')),
  user_id             text    not null references public.users(id) on delete cascade,
  topic_id            text    not null references public.topics(id) on delete cascade,
  lecture_click_count integer not null default 0,
  lecture_quiz_passed boolean not null default false,
  dpp_completed       boolean not null default false,
  pyq_completed       boolean not null default false,
  topic_test_passed   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, topic_id)
);
do $$ begin
  create trigger topic_progress_updated_at before update on public.topic_progress
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 14. NOTES  (B2-stored PDF uploads per chapter)
-- ============================================================
create table if not exists public.notes (
  id              text primary key default ('note_' || replace(gen_random_uuid()::text, '-', '')),
  user_id         text    not null references public.users(id) on delete cascade,
  chapter_id      text    not null references public.chapters(id) on delete cascade,
  file_name       text    not null,
  file_size_bytes integer not null default 0,
  b2_key          text    not null,
  uploaded_at     timestamptz not null default now(),
  annotations     text
);

-- ============================================================
-- 15. INLINE NOTES  (Markdown notes per topic, per user)
-- ============================================================
create table if not exists public.inline_notes (
  id         text primary key default ('in_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  topic_id   text not null references public.topics(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, topic_id)
);
do $$ begin
  create trigger inline_notes_updated_at before update on public.inline_notes
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 16. POMODORO SESSIONS
-- Columns match what the frontend hook inserts/reads:
--   duration_minutes, completed_at
-- ============================================================
create table if not exists public.pomodoro_sessions (
  id               text primary key default ('pom_' || replace(gen_random_uuid()::text, '-', '')),
  user_id          text    not null references public.users(id) on delete cascade,
  duration_minutes integer not null default 25,
  break_minutes    integer not null default 5,
  task_id          text    references public.study_tasks(id) on delete set null,
  completed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Migration: add any columns that may be missing when the table was created
-- by an older schema version (start_time/end_time era). All blocks are safe to re-run.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pomodoro_sessions' and column_name = 'completed_at'
  ) then
    alter table public.pomodoro_sessions add column completed_at timestamptz not null default now();
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pomodoro_sessions' and column_name = 'duration_minutes'
  ) then
    alter table public.pomodoro_sessions add column duration_minutes integer not null default 25;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pomodoro_sessions' and column_name = 'break_minutes'
  ) then
    alter table public.pomodoro_sessions add column break_minutes integer not null default 5;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pomodoro_sessions' and column_name = 'task_id'
  ) then
    alter table public.pomodoro_sessions add column task_id text references public.study_tasks(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- 17. STUDY TASKS  (daily planner — auto-generated or manual)
-- ============================================================
create table if not exists public.study_tasks (
  id             text        primary key default ('task_' || replace(gen_random_uuid()::text, '-', '')),
  user_id        text        not null references public.users(id) on delete cascade,
  title          text        not null,
  description    text,
  status         task_status not null default 'pending',
  source         task_source not null default 'manual',
  topic_id       text        references public.topics(id) on delete set null,
  sort_order     integer     not null default 0,
  scheduled_date date        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
do $$ begin
  create trigger study_tasks_updated_at before update on public.study_tasks
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 18. EXTERNAL TESTS  (off-platform exam scores)
-- ============================================================
create table if not exists public.external_tests (
  id                text               primary key default ('ext_' || replace(gen_random_uuid()::text, '-', '')),
  user_id           text               not null references public.users(id) on delete cascade,
  exam_name         text               not null,
  exam_type         text               not null default 'other',
  score             real               not null,
  max_score         real               not null,
  total_questions   integer,
  correct_answers   integer,
  incorrect_answers integer,
  skipped_answers   integer,
  rank              integer,
  percentile        real,
  attempted_at      timestamptz        not null,
  notes             text,
  created_at        timestamptz        not null default now()
);

-- ============================================================
-- 19. NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id         text primary key default ('notif_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text    not null references public.users(id) on delete cascade,
  type       text    not null,
  title      text    not null,
  message    text    not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 20. SYSTEM CONFIG  (admin key-value settings)
-- ============================================================
create table if not exists public.system_config (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz not null default now()
);
do $$ begin
  create trigger system_config_updated_at before update on public.system_config
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

insert into public.system_config (key, value, description) values
  ('max_exam_attempts',          '3',     'Maximum attempts per exam per user'),
  ('passing_score_default',      '60',    'Default passing score percentage'),
  ('max_upload_size_mb',         '10',    'Maximum file upload size in MB'),
  ('low_ctr_threshold',          '3',     'Lecture click count below which a topic is low engagement'),
  ('maintenance_mode',           'false', 'Show maintenance banner on frontend'),
  ('storage_alert_threshold_gb', '8',     'B2 storage alert threshold in GB'),
  ('storage_limit_gb',           '10',    'B2 total storage limit in GB')
on conflict (key) do nothing;

-- ============================================================
-- 21. AUDIT LOGS
-- ============================================================
create table if not exists public.audit_logs (
  id         text primary key default ('aud_' || replace(gen_random_uuid()::text, '-', '')),
  actor_id   text references public.users(id) on delete set null,
  target_id  text,
  action     text not null,
  details    text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 22. QR SCAN LOGS
-- ============================================================
create table if not exists public.qr_scan_logs (
  id          text primary key default ('qr_' || replace(gen_random_uuid()::text, '-', '')),
  user_id     text not null references public.users(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  exam_id     text,
  result_id   text,
  scanned_at  timestamptz not null default now()
);

-- ============================================================
-- 23. PUSH SUBSCRIPTIONS  (Web Push / VAPID)
-- ============================================================
create table if not exists public.push_subscriptions (
  id         text primary key default ('push_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text,
  auth       text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 24. RLS HELPER FUNCTIONS
-- All comparisons cast to ::text — works with text or uuid ids.
-- ============================================================
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id::text = auth.uid()::text
      and role in ('admin', 'super_admin')
      and deleted_at is null
  )
$$ language sql security definer stable;

create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id::text = auth.uid()::text
      and role = 'super_admin'
      and deleted_at is null
  )
$$ language sql security definer stable;

create or replace function public.is_approved()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id::text = auth.uid()::text
      and status = 'approved'
      and deleted_at is null
  )
$$ language sql security definer stable;

create or replace function public.get_my_role()
returns text as $$
  select role::text from public.users where id::text = auth.uid()::text
$$ language sql security definer stable;

-- ============================================================
-- 25. ROW LEVEL SECURITY
-- Policies are dropped before recreation so re-runs are safe.
-- The anon key is used from the frontend — RLS enforces access.
-- ============================================================

-- ── USERS ────────────────────────────────────────────────────
alter table public.users enable row level security;
drop policy if exists "Users read own row or admin reads all" on public.users;
drop policy if exists "Users update own row" on public.users;
drop policy if exists "Admins update any user" on public.users;
drop policy if exists "Auth trigger inserts users" on public.users;

create policy "Users read own row or admin reads all" on public.users
  for select using (id::text = auth.uid()::text or public.is_admin());
create policy "Users update own row" on public.users
  for update using (id::text = auth.uid()::text)
  with check (id::text = auth.uid()::text);
create policy "Admins update any user" on public.users
  for update using (public.is_admin());
create policy "Auth trigger inserts users" on public.users
  for insert with check (true);

-- ── SUBJECTS ─────────────────────────────────────────────────
alter table public.subjects enable row level security;
drop policy if exists "Anyone approved reads subjects" on public.subjects;
drop policy if exists "Admins write subjects" on public.subjects;

create policy "Anyone approved reads subjects" on public.subjects
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write subjects" on public.subjects
  for all using (public.is_admin());

-- ── CHAPTERS ─────────────────────────────────────────────────
alter table public.chapters enable row level security;
drop policy if exists "Anyone approved reads chapters" on public.chapters;
drop policy if exists "Admins write chapters" on public.chapters;

create policy "Anyone approved reads chapters" on public.chapters
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write chapters" on public.chapters
  for all using (public.is_admin());

-- ── TOPICS ───────────────────────────────────────────────────
alter table public.topics enable row level security;
drop policy if exists "Anyone approved reads topics" on public.topics;
drop policy if exists "Admins write topics" on public.topics;

create policy "Anyone approved reads topics" on public.topics
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write topics" on public.topics
  for all using (public.is_admin());

-- ── QUESTIONS ────────────────────────────────────────────────
alter table public.questions enable row level security;
drop policy if exists "Approved users read questions" on public.questions;
drop policy if exists "Admins write questions" on public.questions;

create policy "Approved users read questions" on public.questions
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write questions" on public.questions
  for all using (public.is_admin());

-- ── EXAMS ────────────────────────────────────────────────────
alter table public.exams enable row level security;
drop policy if exists "Approved users read exams" on public.exams;
drop policy if exists "Admins write exams" on public.exams;

create policy "Approved users read exams" on public.exams
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write exams" on public.exams
  for all using (public.is_admin());

-- ── EXAM QUESTIONS ───────────────────────────────────────────
alter table public.exam_questions enable row level security;
drop policy if exists "Approved users read exam_questions" on public.exam_questions;
drop policy if exists "Admins write exam_questions" on public.exam_questions;

create policy "Approved users read exam_questions" on public.exam_questions
  for select using (public.is_approved() or public.is_admin());
create policy "Admins write exam_questions" on public.exam_questions
  for all using (public.is_admin());

-- ── EXAM ATTEMPTS ────────────────────────────────────────────
alter table public.exam_attempts enable row level security;
drop policy if exists "Users read own attempts, admins read all" on public.exam_attempts;
drop policy if exists "Approved users insert own attempts" on public.exam_attempts;
drop policy if exists "Users update own in-progress attempts" on public.exam_attempts;

create policy "Users read own attempts, admins read all" on public.exam_attempts
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Approved users insert own attempts" on public.exam_attempts
  for insert with check (user_id::text = auth.uid()::text and public.is_approved());
create policy "Users update own in-progress attempts" on public.exam_attempts
  for update using (user_id::text = auth.uid()::text or public.is_admin());

-- ── ATTEMPT ANSWERS ──────────────────────────────────────────
alter table public.attempt_answers enable row level security;
drop policy if exists "Users read own answers" on public.attempt_answers;
drop policy if exists "Users insert own answers" on public.attempt_answers;
drop policy if exists "Users update own answers" on public.attempt_answers;

create policy "Users read own answers" on public.attempt_answers
  for select using (
    exists (select 1 from public.exam_attempts ea
      where ea.id = attempt_id and ea.user_id::text = auth.uid()::text)
    or public.is_admin()
  );
create policy "Users insert own answers" on public.attempt_answers
  for insert with check (
    exists (select 1 from public.exam_attempts ea
      where ea.id = attempt_id and ea.user_id::text = auth.uid()::text)
  );
create policy "Users update own answers" on public.attempt_answers
  for update using (
    exists (select 1 from public.exam_attempts ea
      where ea.id = attempt_id and ea.user_id::text = auth.uid()::text)
  );

-- ── EXAM RESULTS ─────────────────────────────────────────────
alter table public.exam_results enable row level security;
drop policy if exists "Users read own results, admins read all" on public.exam_results;
drop policy if exists "Users insert own results" on public.exam_results;

create policy "Users read own results, admins read all" on public.exam_results
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Users insert own results" on public.exam_results
  for insert with check (user_id::text = auth.uid()::text or public.is_admin());

-- ── TOPIC PROGRESS ───────────────────────────────────────────
alter table public.topic_progress enable row level security;
drop policy if exists "Users read own progress, admins read all" on public.topic_progress;
drop policy if exists "Users insert own progress" on public.topic_progress;
drop policy if exists "Users update own progress" on public.topic_progress;

create policy "Users read own progress, admins read all" on public.topic_progress
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Users insert own progress" on public.topic_progress
  for insert with check (user_id::text = auth.uid()::text);
create policy "Users update own progress" on public.topic_progress
  for update using (user_id::text = auth.uid()::text);

-- ── NOTES ────────────────────────────────────────────────────
alter table public.notes enable row level security;
drop policy if exists "Users read own notes, admins read all" on public.notes;
drop policy if exists "Approved users insert notes" on public.notes;
drop policy if exists "Users delete own notes" on public.notes;

create policy "Users read own notes, admins read all" on public.notes
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Approved users insert notes" on public.notes
  for insert with check (user_id::text = auth.uid()::text and public.is_approved());
create policy "Users delete own notes" on public.notes
  for delete using (user_id::text = auth.uid()::text or public.is_admin());

-- ── INLINE NOTES ─────────────────────────────────────────────
alter table public.inline_notes enable row level security;
drop policy if exists "Users manage own inline notes" on public.inline_notes;

create policy "Users manage own inline notes" on public.inline_notes
  for all using (user_id::text = auth.uid()::text);

-- ── POMODORO SESSIONS ────────────────────────────────────────
alter table public.pomodoro_sessions enable row level security;
drop policy if exists "Users read own pomodoro" on public.pomodoro_sessions;
drop policy if exists "Approved users insert pomodoro" on public.pomodoro_sessions;

create policy "Users read own pomodoro" on public.pomodoro_sessions
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Approved users insert pomodoro" on public.pomodoro_sessions
  for insert with check (user_id::text = auth.uid()::text and public.is_approved());

-- ── STUDY TASKS ──────────────────────────────────────────────
alter table public.study_tasks enable row level security;
drop policy if exists "Users manage own study tasks" on public.study_tasks;

create policy "Users manage own study tasks" on public.study_tasks
  for all using (user_id::text = auth.uid()::text);

-- ── EXTERNAL TESTS ───────────────────────────────────────────
alter table public.external_tests enable row level security;
drop policy if exists "Users read own external tests, admins all" on public.external_tests;
drop policy if exists "Approved users insert external tests" on public.external_tests;
drop policy if exists "Users delete own external tests" on public.external_tests;

create policy "Users read own external tests, admins all" on public.external_tests
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Approved users insert external tests" on public.external_tests
  for insert with check (user_id::text = auth.uid()::text and public.is_approved());
create policy "Users delete own external tests" on public.external_tests
  for delete using (user_id::text = auth.uid()::text);

-- ── NOTIFICATIONS ────────────────────────────────────────────
alter table public.notifications enable row level security;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users mark notifications read" on public.notifications;
drop policy if exists "Admins insert notifications" on public.notifications;

create policy "Users read own notifications" on public.notifications
  for select using (user_id::text = auth.uid()::text);
create policy "Users mark notifications read" on public.notifications
  for update using (user_id::text = auth.uid()::text);
create policy "Admins insert notifications" on public.notifications
  for insert with check (public.is_admin());

-- ── SYSTEM CONFIG ────────────────────────────────────────────
alter table public.system_config enable row level security;
drop policy if exists "Approved users read system config" on public.system_config;
drop policy if exists "Admins manage system config" on public.system_config;

create policy "Approved users read system config" on public.system_config
  for select using (public.is_approved() or public.is_admin());
create policy "Admins manage system config" on public.system_config
  for all using (public.is_admin());

-- ── AUDIT LOGS ───────────────────────────────────────────────
alter table public.audit_logs enable row level security;
drop policy if exists "Admins read audit logs" on public.audit_logs;
drop policy if exists "Admins insert audit logs" on public.audit_logs;

create policy "Admins read audit logs" on public.audit_logs
  for select using (public.is_admin());
create policy "Admins insert audit logs" on public.audit_logs
  for insert with check (public.is_admin());

-- ── QR SCAN LOGS ─────────────────────────────────────────────
alter table public.qr_scan_logs enable row level security;
drop policy if exists "Users read own QR scans, admins read all" on public.qr_scan_logs;
drop policy if exists "Approved users insert QR scans" on public.qr_scan_logs;

create policy "Users read own QR scans, admins read all" on public.qr_scan_logs
  for select using (user_id::text = auth.uid()::text or public.is_admin());
create policy "Approved users insert QR scans" on public.qr_scan_logs
  for insert with check (user_id::text = auth.uid()::text and public.is_approved());

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;

create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using (user_id::text = auth.uid()::text);

-- ============================================================
-- 26. PERFORMANCE INDEXES
-- ============================================================
create index if not exists idx_chapters_subject_id      on public.chapters(subject_id);
create index if not exists idx_topics_chapter_id        on public.topics(chapter_id);
create index if not exists idx_questions_topic_id       on public.questions(topic_id);
create index if not exists idx_exams_type               on public.exams(type);
create index if not exists idx_exams_topic_id           on public.exams(topic_id);
create index if not exists idx_exams_chapter_id         on public.exams(chapter_id);
create index if not exists idx_exam_questions_exam_id   on public.exam_questions(exam_id);
create index if not exists idx_exam_attempts_user_id    on public.exam_attempts(user_id);
create index if not exists idx_exam_attempts_exam_id    on public.exam_attempts(exam_id);
create index if not exists idx_exam_attempts_status     on public.exam_attempts(status);
create index if not exists idx_attempt_answers_attempt  on public.attempt_answers(attempt_id);
create index if not exists idx_exam_results_user_id     on public.exam_results(user_id);
create index if not exists idx_exam_results_exam_id     on public.exam_results(exam_id);
create index if not exists idx_topic_progress_user_id   on public.topic_progress(user_id);
create index if not exists idx_topic_progress_topic_id  on public.topic_progress(topic_id);
create index if not exists idx_notes_user_id            on public.notes(user_id);
create index if not exists idx_notes_chapter_id         on public.notes(chapter_id);
create index if not exists idx_inline_notes_user_topic  on public.inline_notes(user_id, topic_id);
create index if not exists idx_pomodoro_user_id         on public.pomodoro_sessions(user_id);
create index if not exists idx_pomodoro_completed_at    on public.pomodoro_sessions(completed_at);
create index if not exists idx_study_tasks_user_id      on public.study_tasks(user_id);
create index if not exists idx_study_tasks_date         on public.study_tasks(scheduled_date);
create index if not exists idx_study_tasks_status       on public.study_tasks(status);
create index if not exists idx_external_tests_user_id   on public.external_tests(user_id);
create index if not exists idx_notifications_user_id    on public.notifications(user_id);
create index if not exists idx_notifications_is_read    on public.notifications(is_read);
create index if not exists idx_audit_logs_actor_id      on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at    on public.audit_logs(created_at desc);
create index if not exists idx_qr_scan_logs_user_id     on public.qr_scan_logs(user_id);
create index if not exists idx_qr_scan_logs_question_id on public.qr_scan_logs(question_id);
create index if not exists idx_push_subs_user_id        on public.push_subscriptions(user_id);

-- ============================================================
-- DONE
-- 23 tables | 8 enums | full RLS | auto-updated_at triggers
-- auth.users → public.users sync via DB triggers
-- First registered user is automatically super_admin + approved
-- ============================================================
