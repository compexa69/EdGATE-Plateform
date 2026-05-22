-- =============================================================================
-- EdTech Study Platform — Supabase SQL Schema
-- Run this entire script in the Supabase SQL Editor (once, on a fresh project)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

create type user_role as enum ('super_admin', 'admin', 'student');
create type user_status as enum ('pending_approval', 'approved', 'suspended', 'banned');
create type difficulty as enum ('easy', 'medium', 'hard');
create type exam_type as enum ('lecture_quiz', 'dpp', 'pyq', 'topic_test', 'chapter_test', 'subject_test', 'grand_test', 'drill');
create type attempt_status as enum ('in_progress', 'paused', 'submitted', 'auto_submitted');
create type task_status as enum ('pending', 'in_progress', 'completed', 'skipped');
create type task_source as enum ('auto', 'manual');
create type external_exam_type as enum ('jee_main', 'jee_advanced', 'neet', 'gate', 'bitsat', 'viteee', 'other');

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- users
create table users (
  id                    text primary key,
  full_name             text not null,
  email                 text not null unique,
  mobile                text not null,
  password_hash         text not null,
  role                  user_role not null default 'student',
  status                user_status not null default 'pending_approval',
  email_verified        boolean not null default false,
  email_verify_token    text,
  email_verify_expiry   timestamptz,
  password_reset_token  text,
  password_reset_expiry timestamptz,
  email_change_token    text,
  email_change_new_email text,
  email_change_expiry   timestamptz,
  photo_b2_key          text,
  last_login_at         timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- subjects
create table subjects (
  id          text primary key,
  name        text not null,
  description text,
  "order"     integer not null default 0,
  icon_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- chapters
create table chapters (
  id          text primary key,
  subject_id  text not null references subjects(id) on delete cascade,
  name        text not null,
  description text,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- topics
create table topics (
  id                  text primary key,
  chapter_id          text not null references chapters(id) on delete cascade,
  name                text not null,
  description         text,
  "order"             integer not null default 0,
  telegram_chat_id    text,
  telegram_message_id text,
  telegram_url        text,
  youtube_url         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- questions
create table questions (
  id            text primary key,
  topic_id      text references topics(id) on delete set null,
  text          text not null,
  options       text[] not null,
  correct_option text not null,
  marks         real not null default 4,
  image_url     text,
  text_solution text,
  video_url     text,
  qr_code_svg   text,
  difficulty    difficulty not null default 'medium',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- exams
create table exams (
  id               text primary key,
  title            text not null,
  type             exam_type not null,
  subject_id       text references subjects(id) on delete set null,
  chapter_id       text references chapters(id) on delete set null,
  topic_id         text references topics(id) on delete set null,
  duration_minutes integer not null default 60,
  passing_score    integer,
  negative_marking real not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- exam_questions
create table exam_questions (
  id          text primary key,
  exam_id     text not null references exams(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  "order"     integer not null default 0
);

-- exam_attempts
create table exam_attempts (
  id                text primary key,
  user_id           text not null references users(id) on delete cascade,
  exam_id           text not null references exams(id) on delete cascade,
  status            attempt_status not null default 'in_progress',
  start_time        timestamptz not null default now(),
  end_time          timestamptz,
  pause_count       integer not null default 0,
  remaining_seconds integer not null default 3600,
  resumed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- attempt_answers
create table attempt_answers (
  id                   text primary key,
  attempt_id           text not null references exam_attempts(id) on delete cascade,
  question_id          text not null,
  selected_option      text,
  is_marked_for_review boolean not null default false,
  time_spent_seconds   integer not null default 0,
  updated_at           timestamptz not null default now()
);

-- exam_results
create table exam_results (
  id                 text primary key,
  attempt_id         text not null references exam_attempts(id) on delete cascade,
  user_id            text not null references users(id) on delete cascade,
  exam_id            text not null references exams(id) on delete cascade,
  score              real not null default 0,
  max_score          real not null default 0,
  accuracy           real not null default 0,
  total_questions    integer not null default 0,
  correct_answers    integer not null default 0,
  incorrect_answers  integer not null default 0,
  skipped_answers    integer not null default 0,
  time_taken_seconds integer not null default 0,
  passed             boolean not null default false,
  submitted_at       timestamptz not null default now()
);

-- topic_progress  (unique per user+topic)
create table topic_progress (
  id                   text primary key,
  user_id              text not null references users(id) on delete cascade,
  topic_id             text not null references topics(id) on delete cascade,
  lecture_click_count  integer not null default 0,
  lecture_quiz_passed  boolean not null default false,
  dpp_completed        boolean not null default false,
  pyq_completed        boolean not null default false,
  topic_test_passed    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, topic_id)
);

-- notes  (PDF uploads, stored in B2)
create table notes (
  id              text primary key,
  user_id         text not null references users(id) on delete cascade,
  chapter_id      text not null references chapters(id) on delete cascade,
  file_name       text not null,
  file_size_bytes integer not null,
  b2_key          text not null,
  uploaded_at     timestamptz not null default now(),
  annotations     text
);

-- inline_notes  (per-topic markdown)
create table inline_notes (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  topic_id   text not null references topics(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

-- notifications
create table notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- audit_logs
create table audit_logs (
  id         text primary key,
  actor_id   text references users(id) on delete set null,
  target_id  text,
  action     text not null,
  details    text,
  created_at timestamptz not null default now()
);

-- study_tasks
create table study_tasks (
  id             text primary key,
  user_id        text not null references users(id) on delete cascade,
  title          text not null,
  description    text,
  status         task_status not null default 'pending',
  source         task_source not null default 'manual',
  topic_id       text references topics(id) on delete set null,
  is_locked      text not null default 'false',
  sort_order     integer not null default 0,
  scheduled_date date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- pomodoro_sessions
create table pomodoro_sessions (
  id               text primary key,
  user_id          text not null references users(id) on delete cascade,
  duration_seconds integer not null,
  topic_context    text,
  topic_id         text references topics(id) on delete set null,
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  created_at       timestamptz not null default now()
);

-- external_tests
create table external_tests (
  id               text primary key,
  user_id          text not null references users(id) on delete cascade,
  exam_name        text not null,
  exam_type        external_exam_type not null default 'other',
  score            real not null,
  max_score        real not null,
  total_questions  integer,
  correct_answers  integer,
  incorrect_answers integer,
  skipped_answers  integer,
  rank             integer,
  percentile       real,
  attempted_at     timestamptz not null,
  notes            text,
  created_at       timestamptz not null default now()
);

-- push_subscriptions  (Web Push)
create table push_subscriptions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text,
  auth       text,
  created_at timestamptz not null default now()
);

-- qr_scan_logs
create table qr_scan_logs (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  exam_id     text,
  result_id   text,
  scanned_at  timestamptz not null default now()
);

-- revoked_tokens  (JWT blocklist)
create table revoked_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  revoked_at timestamptz not null default now()
);

-- system_config  (admin-tunable knobs)
create table system_config (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES  (performance-critical queries)
-- ─────────────────────────────────────────────────────────────────────────────

create index on chapters (subject_id);
create index on topics (chapter_id);
create index on questions (topic_id);
create index on exams (type);
create index on exams (subject_id);
create index on exams (chapter_id);
create index on exams (topic_id);
create index on exam_questions (exam_id);
create index on exam_questions (question_id);
create index on exam_attempts (user_id);
create index on exam_attempts (exam_id);
create index on exam_attempts (status);
create index on attempt_answers (attempt_id);
create index on exam_results (user_id);
create index on exam_results (exam_id);
create index on topic_progress (user_id);
create index on topic_progress (topic_id);
create index on notes (user_id);
create index on notes (chapter_id);
create index on inline_notes (user_id, topic_id);
create index on notifications (user_id, is_read);
create index on audit_logs (actor_id);
create index on audit_logs (created_at desc);
create index on study_tasks (user_id, scheduled_date);
create index on pomodoro_sessions (user_id);
create index on external_tests (user_id);
create index on qr_scan_logs (user_id);
create index on revoked_tokens (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at TRIGGER  (auto-maintain updated_at on every table that has it)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_users_updated_at           before update on users           for each row execute function set_updated_at();
create trigger trg_subjects_updated_at        before update on subjects        for each row execute function set_updated_at();
create trigger trg_chapters_updated_at        before update on chapters        for each row execute function set_updated_at();
create trigger trg_topics_updated_at          before update on topics          for each row execute function set_updated_at();
create trigger trg_questions_updated_at       before update on questions       for each row execute function set_updated_at();
create trigger trg_exams_updated_at           before update on exams           for each row execute function set_updated_at();
create trigger trg_exam_attempts_updated_at   before update on exam_attempts   for each row execute function set_updated_at();
create trigger trg_attempt_answers_updated_at before update on attempt_answers for each row execute function set_updated_at();
create trigger trg_topic_progress_updated_at  before update on topic_progress  for each row execute function set_updated_at();
create trigger trg_study_tasks_updated_at     before update on study_tasks     for each row execute function set_updated_at();
create trigger trg_system_config_updated_at   before update on system_config   for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- All tables use RLS.  The Express API connects via the service-role key
-- (which bypasses RLS), so these policies protect direct client access only.
-- ─────────────────────────────────────────────────────────────────────────────

alter table users              enable row level security;
alter table subjects           enable row level security;
alter table chapters           enable row level security;
alter table topics             enable row level security;
alter table questions          enable row level security;
alter table exams              enable row level security;
alter table exam_questions     enable row level security;
alter table exam_attempts      enable row level security;
alter table attempt_answers    enable row level security;
alter table exam_results       enable row level security;
alter table topic_progress     enable row level security;
alter table notes              enable row level security;
alter table inline_notes       enable row level security;
alter table notifications      enable row level security;
alter table audit_logs         enable row level security;
alter table study_tasks        enable row level security;
alter table pomodoro_sessions  enable row level security;
alter table external_tests     enable row level security;
alter table push_subscriptions enable row level security;
alter table qr_scan_logs       enable row level security;
alter table revoked_tokens     enable row level security;
alter table system_config      enable row level security;

-- Service role bypasses RLS — all API access goes through it.
-- The policies below are a safety net for any future direct-client queries.

-- Public read for content tables (subjects / chapters / topics / questions / exams)
create policy "public read subjects"    on subjects    for select using (true);
create policy "public read chapters"    on chapters    for select using (true);
create policy "public read topics"      on topics      for select using (true);
create policy "public read questions"   on questions   for select using (true);
create policy "public read exams"       on exams       for select using (true);
create policy "public read exam_questions" on exam_questions for select using (true);

-- Users can only read/write their own rows
create policy "own user row"          on users             for all  using (auth.uid()::text = id);
create policy "own attempts"          on exam_attempts     for all  using (auth.uid()::text = user_id);
create policy "own answers"           on attempt_answers   for all  using (
  auth.uid()::text = (select user_id from exam_attempts where id = attempt_id)
);
create policy "own results"           on exam_results      for all  using (auth.uid()::text = user_id);
create policy "own progress"          on topic_progress    for all  using (auth.uid()::text = user_id);
create policy "own notes"             on notes             for all  using (auth.uid()::text = user_id);
create policy "own inline_notes"      on inline_notes      for all  using (auth.uid()::text = user_id);
create policy "own notifications"     on notifications     for all  using (auth.uid()::text = user_id);
create policy "own study_tasks"       on study_tasks       for all  using (auth.uid()::text = user_id);
create policy "own pomodoro_sessions" on pomodoro_sessions for all  using (auth.uid()::text = user_id);
create policy "own external_tests"    on external_tests    for all  using (auth.uid()::text = user_id);
create policy "own push_subs"         on push_subscriptions for all using (auth.uid()::text = user_id);
create policy "own qr_scans"          on qr_scan_logs      for all  using (auth.uid()::text = user_id);

-- Audit logs and system config: service role only (no direct client access)
create policy "no direct access audit_logs"    on audit_logs    for all using (false);
create policy "no direct access system_config" on system_config for all using (false);
create policy "no direct access revoked_tokens" on revoked_tokens for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFAULT SYSTEM CONFIG  (matches the defaults in admin.ts)
-- ─────────────────────────────────────────────────────────────────────────────

insert into system_config (key, value, description) values
  ('lecture_quiz_passing_score',  '60',  'Minimum % to pass a Lecture Quiz'),
  ('topic_test_passing_score',    '60',  'Minimum % to pass a Topic Test'),
  ('chapter_test_passing_score',  '60',  'Minimum % to pass a Chapter Test'),
  ('max_quiz_attempts',           '3',   'Max attempts allowed per quiz before cooldown'),
  ('max_exam_pauses',             '2',   'Max pauses allowed per exam attempt'),
  ('daily_study_goal_minutes',    '120', 'Daily study goal in minutes'),
  ('streak_grace_period_hours',   '26',  'Hours before a streak is broken'),
  ('b2_storage_alert_threshold',  '80',  'B2 storage % usage that triggers an alert email')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP FUNCTION  (call periodically to purge expired revoked tokens)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function cleanup_expired_tokens()
returns void language plpgsql as $$
begin
  delete from revoked_tokens where expires_at < now();
end;
$$;

-- Done. All 19 tables, enums, indexes, triggers, RLS policies and seed config
-- are ready. Connect your Express API using the service-role key as DATABASE_URL.
