-- ============================================================
-- EdTech Study Platform — Supabase SQL Schema (Idempotent)
-- Generated: 2026-05-23
--
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. Safe to re-run at any time — fully idempotent.
--
-- NOTES:
--   • users.id is TEXT (cast from auth.users UUID)
--   • A trigger auto-creates a user profile on signup
--   • First registered user is automatically super_admin
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- ENUMS  (wrapped in DO blocks — safe to re-run)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text
      AND role IN ('admin', 'super_admin')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- USERS  (profile table — mirrors auth.users)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT        PRIMARY KEY,
  full_name      TEXT        NOT NULL DEFAULT '',
  email          TEXT        NOT NULL UNIQUE,
  mobile         TEXT        NOT NULL DEFAULT '',
  role           user_role   NOT NULL DEFAULT 'student',
  status         user_status NOT NULL DEFAULT 'pending_approval',
  email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  photo_b2_key   TEXT,
  last_login_at  TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- First signup auto-creates profile + assigns super_admin to the very first user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.users WHERE deleted_at IS NULL;
  INSERT INTO public.users (id, full_name, email, mobile, role, status, email_verified)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- ─────────────────────────────────────────────────────────────
-- SUBJECTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  "order"     INTEGER     NOT NULL DEFAULT 0,
  icon_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS subjects_updated_at ON subjects;
CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_chapters_subject_id ON chapters(subject_id);

-- ─────────────────────────────────────────────────────────────
-- CHAPTERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapters (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  subject_id  TEXT        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  "order"     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS chapters_updated_at ON chapters;
CREATE TRIGGER chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(subject_id);

-- ─────────────────────────────────────────────────────────────
-- TOPICS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  chapter_id          TEXT        NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT,
  "order"             INTEGER     NOT NULL DEFAULT 0,
  telegram_chat_id    TEXT,
  telegram_message_id TEXT,
  telegram_url        TEXT,
  youtube_url         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS topics_updated_at ON topics;
CREATE TRIGGER topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topics_chapter ON topics(chapter_id);

-- ─────────────────────────────────────────────────────────────
-- QUESTIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  topic_id       TEXT        REFERENCES topics(id) ON DELETE SET NULL,
  text           TEXT        NOT NULL,
  options        TEXT[]      NOT NULL,
  correct_option TEXT        NOT NULL,
  marks          REAL        NOT NULL DEFAULT 4,
  image_url      TEXT,
  text_solution  TEXT,
  video_url      TEXT,
  qr_code_svg    TEXT,
  difficulty     difficulty  NOT NULL DEFAULT 'medium',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS questions_updated_at ON questions;
CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);

-- ─────────────────────────────────────────────────────────────
-- EXAMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  title            TEXT        NOT NULL,
  type             exam_type   NOT NULL,
  subject_id       TEXT        REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id       TEXT        REFERENCES chapters(id) ON DELETE SET NULL,
  topic_id         TEXT        REFERENCES topics(id)   ON DELETE SET NULL,
  duration_minutes INTEGER     NOT NULL DEFAULT 60,
  passing_score    INTEGER,
  negative_marking REAL        NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS exams_updated_at ON exams;
CREATE TRIGGER exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_exams_topic   ON exams(topic_id);
CREATE INDEX IF NOT EXISTS idx_exams_chapter ON exams(chapter_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_type    ON exams(type);

-- ─────────────────────────────────────────────────────────────
-- EXAM QUESTIONS  (junction)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_questions (
  id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  exam_id     TEXT    NOT NULL REFERENCES exams(id)     ON DELETE CASCADE,
  question_id TEXT    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  "order"     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam      ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question  ON exam_questions(question_id);

-- ─────────────────────────────────────────────────────────────
-- EXAM ATTEMPTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_attempts (
  id                TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id           TEXT           NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  status            attempt_status NOT NULL DEFAULT 'in_progress',
  start_time        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  end_time          TIMESTAMPTZ,
  pause_count       INTEGER        NOT NULL DEFAULT 0,
  remaining_seconds INTEGER        NOT NULL DEFAULT 3600,
  resumed_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS exam_attempts_updated_at ON exam_attempts;
CREATE TRIGGER exam_attempts_updated_at
  BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user   ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam   ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);

-- ─────────────────────────────────────────────────────────────
-- ATTEMPT ANSWERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attempt_answers (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  attempt_id           TEXT        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id          TEXT        NOT NULL,
  selected_option      TEXT,
  is_marked_for_review BOOLEAN     NOT NULL DEFAULT FALSE,
  time_spent_seconds   INTEGER     NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);

-- ─────────────────────────────────────────────────────────────
-- EXAM RESULTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_results (
  id                 TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  attempt_id         TEXT        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id            TEXT        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  exam_id            TEXT        NOT NULL REFERENCES exams(id)         ON DELETE CASCADE,
  score              REAL        NOT NULL DEFAULT 0,
  max_score          REAL        NOT NULL DEFAULT 0,
  accuracy           REAL        NOT NULL DEFAULT 0,
  total_questions    INTEGER     NOT NULL DEFAULT 0,
  correct_answers    INTEGER     NOT NULL DEFAULT 0,
  incorrect_answers  INTEGER     NOT NULL DEFAULT 0,
  skipped_answers    INTEGER     NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER     NOT NULL DEFAULT 0,
  passed             BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);

-- ─────────────────────────────────────────────────────────────
-- TOPIC PROGRESS  (SRS gating: one row per user+topic)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topic_progress (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id              TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  topic_id             TEXT        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  lecture_click_count  INTEGER     NOT NULL DEFAULT 0,
  lecture_quiz_passed  BOOLEAN     NOT NULL DEFAULT FALSE,
  dpp_completed        BOOLEAN     NOT NULL DEFAULT FALSE,
  pyq_completed        BOOLEAN     NOT NULL DEFAULT FALSE,
  topic_test_passed    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

DROP TRIGGER IF EXISTS topic_progress_updated_at ON topic_progress;
CREATE TRIGGER topic_progress_updated_at
  BEFORE UPDATE ON topic_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topic_progress_user  ON topic_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_progress_topic ON topic_progress(topic_id);

-- ─────────────────────────────────────────────────────────────
-- NOTES  (PDF uploads stored in Backblaze B2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  chapter_id      TEXT        NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  file_name       TEXT        NOT NULL,
  file_size_bytes INTEGER     NOT NULL,
  b2_key          TEXT        NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotations     TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_user    ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter ON notes(chapter_id);

-- ─────────────────────────────────────────────────────────────
-- INLINE NOTES  (per-topic Markdown scratch pad)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inline_notes (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  topic_id   TEXT        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_inline_notes_user_topic ON inline_notes(user_id, topic_id);

-- ─────────────────────────────────────────────────────────────
-- STUDY TASKS  (planner)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_tasks (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id        TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         task_status NOT NULL DEFAULT 'pending',
  source         task_source NOT NULL DEFAULT 'manual',
  topic_id       TEXT        REFERENCES topics(id) ON DELETE SET NULL,
  is_locked      BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  scheduled_date DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS study_tasks_updated_at ON study_tasks;
CREATE TRIGGER study_tasks_updated_at
  BEFORE UPDATE ON study_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_study_tasks_user        ON study_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_date        ON study_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user_date   ON study_tasks(user_id, scheduled_date);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  actor_id   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  target_id  TEXT,
  action     TEXT        NOT NULL,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor      ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- POMODORO SESSIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id          TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_minutes INTEGER     NOT NULL DEFAULT 25,
  duration_seconds INTEGER     NOT NULL DEFAULT 1500,
  topic_context    TEXT,
  topic_id         TEXT        REFERENCES topics(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pomodoro_user ON pomodoro_sessions(user_id);

-- ─────────────────────────────────────────────────────────────
-- EXTERNAL TESTS  (JEE / NEET / GATE score tracker)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_tests (
  id                TEXT               PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           TEXT               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_name         TEXT               NOT NULL,
  exam_type         external_exam_type NOT NULL DEFAULT 'other',
  score             REAL               NOT NULL,
  max_score         REAL               NOT NULL,
  total_questions   INTEGER,
  correct_answers   INTEGER,
  incorrect_answers INTEGER,
  skipped_answers   INTEGER,
  rank              INTEGER,
  percentile        REAL,
  attempted_at      TIMESTAMPTZ        NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_tests_user ON external_tests(user_id);

-- ─────────────────────────────────────────────────────────────
-- QR SCAN LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  question_id TEXT        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  exam_id     TEXT,
  result_id   TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_user ON qr_scan_logs(user_id);

-- ─────────────────────────────────────────────────────────────
-- PUSH SUBSCRIPTIONS  (Web Push / VAPID)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────
-- REVOKED TOKENS  (JWT block-list — for custom auth flows)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT        PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- ─────────────────────────────────────────────────────────────
-- SYSTEM CONFIG  (admin key-value settings)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS system_config_updated_at ON system_config;
CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default config (ON CONFLICT DO NOTHING — safe to re-run)
INSERT INTO system_config (key, value, description) VALUES
  ('lecture_quiz_passing_score',  '60',    'Minimum % to pass a Lecture Quiz'),
  ('topic_test_passing_score',    '60',    'Minimum % to pass a Topic Test'),
  ('chapter_test_passing_score',  '60',    'Minimum % to pass a Chapter Test'),
  ('max_quiz_attempts',           '3',     'Max attempts allowed per quiz before cooldown'),
  ('max_exam_pauses',             '2',     'Max pauses allowed per exam attempt'),
  ('daily_study_goal_minutes',    '120',   'Daily study goal in minutes'),
  ('streak_grace_period_hours',   '26',    'Hours before a streak is broken'),
  ('b2_storage_alert_threshold',  '80',    'B2 storage % usage that triggers an alert email'),
  ('maintenance_mode',            'false', 'Set to true for read-only maintenance mode'),
  ('registration_open',           'true',  'Allow new student self-registration'),
  ('xp_per_pomodoro',             '10',    'XP awarded for completing one Pomodoro session'),
  ('xp_per_quiz_pass',            '50',    'XP awarded for passing a quiz')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- All direct client calls from the frontend use Supabase Auth.
-- Edge Functions call with the service-role key (bypasses RLS).
-- ============================================================

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

-- Drop all policies cleanly before recreating (idempotent)
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ── Public read (content viewable by all authenticated users) ─────────────────
CREATE POLICY "public read subjects"       ON subjects       FOR SELECT USING (true);
CREATE POLICY "public read chapters"       ON chapters       FOR SELECT USING (true);
CREATE POLICY "public read topics"         ON topics         FOR SELECT USING (true);
CREATE POLICY "public read questions"      ON questions      FOR SELECT USING (true);
CREATE POLICY "public read exams"          ON exams          FOR SELECT USING (true);
CREATE POLICY "public read exam_questions" ON exam_questions FOR SELECT USING (true);

-- ── Users ─────────────────────────────────────────────────────────────────────
-- Students see only their own row; admins see all
CREATE POLICY "users select own"   ON users FOR SELECT USING (auth.uid()::text = id OR is_admin());
CREATE POLICY "users update own"   ON users FOR UPDATE USING (auth.uid()::text = id);

-- ── Per-user ownership ────────────────────────────────────────────────────────
CREATE POLICY "own exam_attempts"      ON exam_attempts      FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own attempt_answers"    ON attempt_answers    FOR ALL USING (
  auth.uid()::text = (SELECT user_id FROM exam_attempts WHERE id = attempt_id LIMIT 1)
);
CREATE POLICY "own exam_results"       ON exam_results       FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own topic_progress"     ON topic_progress     FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own notes"              ON notes              FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own inline_notes"       ON inline_notes       FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own notifications"      ON notifications      FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own study_tasks"        ON study_tasks        FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own pomodoro_sessions"  ON pomodoro_sessions  FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own external_tests"     ON external_tests     FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own push_subscriptions" ON push_subscriptions FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "own qr_scan_logs"       ON qr_scan_logs       FOR ALL USING (auth.uid()::text = user_id);

-- ── Admin-only tables (service role key used in Edge Functions) ───────────────
CREATE POLICY "admin only audit_logs"    ON audit_logs    FOR ALL USING (is_admin());
CREATE POLICY "admin only system_config" ON system_config FOR SELECT USING (is_admin());
CREATE POLICY "no client revoked_tokens" ON revoked_tokens FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- UTILITY: purge expired tokens (call via pg_cron or Edge Function)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM revoked_tokens WHERE expires_at < now();
END;
$$;

-- ============================================================
-- Done. All tables, enums, indexes, triggers, RLS policies,
-- and seed config created. Fully idempotent — safe to re-run.
-- ============================================================
