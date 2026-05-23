-- =============================================================================
-- EdTech Study Platform — Supabase SQL Schema (Idempotent / Re-runnable)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run at any time — all statements are idempotent.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS  (wrapped in DO blocks so re-runs are safe)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_status AS ENUM ('pending_approval', 'approved', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE exam_type AS ENUM ('lecture_quiz', 'dpp', 'pyq', 'topic_test', 'chapter_test', 'subject_test', 'grand_test', 'drill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE attempt_status AS ENUM ('in_progress', 'paused', 'submitted', 'auto_submitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE task_source AS ENUM ('auto', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE external_exam_type AS ENUM ('jee_main', 'jee_advanced', 'neet', 'gate', 'bitsat', 'viteee', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES  (IF NOT EXISTS on every table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                    text PRIMARY KEY,
  full_name             text NOT NULL,
  email                 text NOT NULL UNIQUE,
  mobile                text NOT NULL DEFAULT '',
  password_hash         text NOT NULL DEFAULT '',
  role                  user_role   NOT NULL DEFAULT 'student',
  status                user_status NOT NULL DEFAULT 'pending_approval',
  email_verified        boolean NOT NULL DEFAULT false,
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
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subjects (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  "order"     integer NOT NULL DEFAULT 0,
  icon_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id          text PRIMARY KEY,
  subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  "order"     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topics (
  id                  text PRIMARY KEY,
  chapter_id          text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  "order"             integer NOT NULL DEFAULT 0,
  telegram_chat_id    text,
  telegram_message_id text,
  telegram_url        text,
  youtube_url         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id            text PRIMARY KEY,
  topic_id      text REFERENCES topics(id) ON DELETE SET NULL,
  text          text NOT NULL,
  options       text[] NOT NULL,
  correct_option text NOT NULL,
  marks         real NOT NULL DEFAULT 4,
  image_url     text,
  text_solution text,
  video_url     text,
  qr_code_svg   text,
  difficulty    difficulty NOT NULL DEFAULT 'medium',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exams (
  id               text PRIMARY KEY,
  title            text NOT NULL,
  type             exam_type NOT NULL,
  subject_id       text REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id       text REFERENCES chapters(id) ON DELETE SET NULL,
  topic_id         text REFERENCES topics(id) ON DELETE SET NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  passing_score    integer,
  negative_marking real NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id          text PRIMARY KEY,
  exam_id     text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  "order"     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id                text PRIMARY KEY,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id           text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  status            attempt_status NOT NULL DEFAULT 'in_progress',
  start_time        timestamptz NOT NULL DEFAULT now(),
  end_time          timestamptz,
  pause_count       integer NOT NULL DEFAULT 0,
  remaining_seconds integer NOT NULL DEFAULT 3600,
  resumed_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id                   text PRIMARY KEY,
  attempt_id           text NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id          text NOT NULL,
  selected_option      text,
  is_marked_for_review boolean NOT NULL DEFAULT false,
  time_spent_seconds   integer NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_results (
  id                 text PRIMARY KEY,
  attempt_id         text NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id            text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  score              real NOT NULL DEFAULT 0,
  max_score          real NOT NULL DEFAULT 0,
  accuracy           real NOT NULL DEFAULT 0,
  total_questions    integer NOT NULL DEFAULT 0,
  correct_answers    integer NOT NULL DEFAULT 0,
  incorrect_answers  integer NOT NULL DEFAULT 0,
  skipped_answers    integer NOT NULL DEFAULT 0,
  time_taken_seconds integer NOT NULL DEFAULT 0,
  passed             boolean NOT NULL DEFAULT false,
  submitted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_progress (
  id                   text PRIMARY KEY,
  user_id              text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id             text NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  lecture_click_count  integer NOT NULL DEFAULT 0,
  lecture_quiz_passed  boolean NOT NULL DEFAULT false,
  dpp_completed        boolean NOT NULL DEFAULT false,
  pyq_completed        boolean NOT NULL DEFAULT false,
  topic_test_passed    boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id      text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  file_size_bytes integer NOT NULL,
  b2_key          text NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  annotations     text
);

CREATE TABLE IF NOT EXISTS inline_notes (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id   text NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         text PRIMARY KEY,
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  target_id  text,
  action     text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_tasks (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  status         task_status NOT NULL DEFAULT 'pending',
  source         task_source NOT NULL DEFAULT 'manual',
  topic_id       text REFERENCES topics(id) ON DELETE SET NULL,
  is_locked      boolean NOT NULL DEFAULT false,
  sort_order     integer NOT NULL DEFAULT 0,
  scheduled_date date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL DEFAULT 25,
  duration_seconds integer NOT NULL DEFAULT 1500,
  topic_context    text,
  topic_id         text REFERENCES topics(id) ON DELETE SET NULL,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_tests (
  id                text PRIMARY KEY,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_name         text NOT NULL,
  exam_type         external_exam_type NOT NULL DEFAULT 'other',
  score             real NOT NULL,
  max_score         real NOT NULL,
  total_questions   integer,
  correct_answers   integer,
  incorrect_answers integer,
  skipped_answers   integer,
  rank              integer,
  percentile        real,
  attempted_at      timestamptz NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text,
  auth       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  exam_id     text,
  result_id   text,
  scanned_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES  (IF NOT EXISTS — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chapters_subject_id        ON chapters (subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_chapter_id          ON topics (chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id         ON questions (topic_id);
CREATE INDEX IF NOT EXISTS idx_exams_type                 ON exams (type);
CREATE INDEX IF NOT EXISTS idx_exams_subject_id           ON exams (subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_chapter_id           ON exams (chapter_id);
CREATE INDEX IF NOT EXISTS idx_exams_topic_id             ON exams (topic_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id     ON exam_questions (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question_id ON exam_questions (question_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id      ON exam_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id      ON exam_attempts (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status       ON exam_attempts (status);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt_id ON attempt_answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_user_id       ON exam_results (user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id       ON exam_results (exam_id);
CREATE INDEX IF NOT EXISTS idx_topic_progress_user_id     ON topic_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_topic_progress_topic_id    ON topic_progress (topic_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id              ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter_id           ON notes (chapter_id);
CREATE INDEX IF NOT EXISTS idx_inline_notes_user_topic    ON inline_notes (user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id        ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at      ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user_date      ON study_tasks (user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_pomodoro_user_id           ON pomodoro_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_external_tests_user_id     ON external_tests (user_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_user_id       ON qr_scan_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at  ON revoked_tokens (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at TRIGGER FUNCTION  (CREATE OR REPLACE — always safe)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS  (DROP IF EXISTS + CREATE — idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_users_updated_at           ON users;
DROP TRIGGER IF EXISTS trg_subjects_updated_at        ON subjects;
DROP TRIGGER IF EXISTS trg_chapters_updated_at        ON chapters;
DROP TRIGGER IF EXISTS trg_topics_updated_at          ON topics;
DROP TRIGGER IF EXISTS trg_questions_updated_at       ON questions;
DROP TRIGGER IF EXISTS trg_exams_updated_at           ON exams;
DROP TRIGGER IF EXISTS trg_exam_attempts_updated_at   ON exam_attempts;
DROP TRIGGER IF EXISTS trg_attempt_answers_updated_at ON attempt_answers;
DROP TRIGGER IF EXISTS trg_topic_progress_updated_at  ON topic_progress;
DROP TRIGGER IF EXISTS trg_study_tasks_updated_at     ON study_tasks;
DROP TRIGGER IF EXISTS trg_system_config_updated_at   ON system_config;

CREATE TRIGGER trg_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subjects_updated_at        BEFORE UPDATE ON subjects        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chapters_updated_at        BEFORE UPDATE ON chapters        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_topics_updated_at          BEFORE UPDATE ON topics          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_questions_updated_at       BEFORE UPDATE ON questions       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exams_updated_at           BEFORE UPDATE ON exams           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exam_attempts_updated_at   BEFORE UPDATE ON exam_attempts   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_attempt_answers_updated_at BEFORE UPDATE ON attempt_answers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_topic_progress_updated_at  BEFORE UPDATE ON topic_progress  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_study_tasks_updated_at     BEFORE UPDATE ON study_tasks     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_system_config_updated_at   BEFORE UPDATE ON system_config   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY  (Supabase-only access — no Express bypass needed)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inline_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pomodoro_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_tests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config      ENABLE ROW LEVEL SECURITY;

-- Drop all policies first (idempotent)
DROP POLICY IF EXISTS "public read subjects"           ON subjects;
DROP POLICY IF EXISTS "public read chapters"           ON chapters;
DROP POLICY IF EXISTS "public read topics"             ON topics;
DROP POLICY IF EXISTS "public read questions"          ON questions;
DROP POLICY IF EXISTS "public read exams"              ON exams;
DROP POLICY IF EXISTS "public read exam_questions"     ON exam_questions;
DROP POLICY IF EXISTS "own user row"                   ON users;
DROP POLICY IF EXISTS "own attempts"                   ON exam_attempts;
DROP POLICY IF EXISTS "own answers"                    ON attempt_answers;
DROP POLICY IF EXISTS "own results"                    ON exam_results;
DROP POLICY IF EXISTS "own progress"                   ON topic_progress;
DROP POLICY IF EXISTS "own notes"                      ON notes;
DROP POLICY IF EXISTS "own inline_notes"               ON inline_notes;
DROP POLICY IF EXISTS "own notifications"              ON notifications;
DROP POLICY IF EXISTS "own study_tasks"                ON study_tasks;
DROP POLICY IF EXISTS "own pomodoro_sessions"          ON pomodoro_sessions;
DROP POLICY IF EXISTS "own external_tests"             ON external_tests;
DROP POLICY IF EXISTS "own push_subs"                  ON push_subscriptions;
DROP POLICY IF EXISTS "own qr_scans"                   ON qr_scan_logs;
DROP POLICY IF EXISTS "no direct access audit_logs"    ON audit_logs;
DROP POLICY IF EXISTS "no direct access system_config" ON system_config;
DROP POLICY IF EXISTS "no direct access revoked_tokens" ON revoked_tokens;
DROP POLICY IF EXISTS "admin read users"               ON users;
DROP POLICY IF EXISTS "admin read all"                 ON system_config;
DROP POLICY IF EXISTS "service role system_config"     ON system_config;

-- Public read for content tables (unauthenticated browsing allowed)
CREATE POLICY "public read subjects"        ON subjects        FOR SELECT USING (true);
CREATE POLICY "public read chapters"        ON chapters        FOR SELECT USING (true);
CREATE POLICY "public read topics"          ON topics          FOR SELECT USING (true);
CREATE POLICY "public read questions"       ON questions       FOR SELECT USING (true);
CREATE POLICY "public read exams"           ON exams           FOR SELECT USING (true);
CREATE POLICY "public read exam_questions"  ON exam_questions  FOR SELECT USING (true);

-- Users: read own row; admins can read all
CREATE POLICY "own user row" ON users
  FOR ALL USING (auth.uid()::text = id);

CREATE POLICY "admin read users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'super_admin')
    )
  );

-- Per-user ownership policies
CREATE POLICY "own attempts"          ON exam_attempts     FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own answers"           ON attempt_answers   FOR ALL USING (
  auth.uid()::text = (SELECT user_id FROM exam_attempts WHERE id = attempt_id)
);
CREATE POLICY "own results"           ON exam_results      FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own progress"          ON topic_progress    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own notes"             ON notes             FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own inline_notes"      ON inline_notes      FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own notifications"     ON notifications     FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own study_tasks"       ON study_tasks       FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own pomodoro_sessions" ON pomodoro_sessions FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own external_tests"    ON external_tests    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own push_subs"         ON push_subscriptions FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own qr_scans"          ON qr_scan_logs      FOR ALL USING (auth.uid()::text = user_id);

-- Audit logs: service role only (Edge Functions use service role key)
CREATE POLICY "no direct access audit_logs"    ON audit_logs    FOR ALL USING (false);
CREATE POLICY "no direct access revoked_tokens" ON revoked_tokens FOR ALL USING (false);

-- System config: readable by admins, writable by service role only
CREATE POLICY "service role system_config" ON system_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- FIRST-USER TRIGGER  (auto-assigns super_admin to the very first signup)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.users WHERE deleted_at IS NULL;
  INSERT INTO public.users (id, full_name, email, mobile, role, status, email_verified)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    CASE WHEN user_count = 0 THEN 'super_admin'::user_role ELSE 'student'::user_role END,
    CASE WHEN user_count = 0 THEN 'approved'::user_status  ELSE 'pending_approval'::user_status END,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFAULT SYSTEM CONFIG SEED
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO system_config (key, value, description) VALUES
  ('lecture_quiz_passing_score',  '60',  'Minimum % to pass a Lecture Quiz'),
  ('topic_test_passing_score',    '60',  'Minimum % to pass a Topic Test'),
  ('chapter_test_passing_score',  '60',  'Minimum % to pass a Chapter Test'),
  ('max_quiz_attempts',           '3',   'Max attempts allowed per quiz before cooldown'),
  ('max_exam_pauses',             '2',   'Max pauses allowed per exam attempt'),
  ('daily_study_goal_minutes',    '120', 'Daily study goal in minutes'),
  ('streak_grace_period_hours',   '26',  'Hours before a streak is broken'),
  ('b2_storage_alert_threshold',  '80',  'B2 storage % usage that triggers an alert email')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- UTILITY: purge expired revoked tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM revoked_tokens WHERE expires_at < now();
END;
$$;

-- Done. Schema is fully idempotent — safe to re-run at any time.
