-- ============================================================
-- EdTech Study Platform — Complete Supabase SQL Setup Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 0. EXTENSIONS ────────────────────────────────────────────
-- (pgcrypto is available by default in Supabase)

-- ── 1. ENUM TYPES ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role   AS ENUM ('super_admin', 'admin', 'student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending_approval', 'approved', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE difficulty  AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exam_type   AS ENUM ('lecture_quiz','dpp','pyq','topic_test','chapter_test','subject_test','grand_test','drill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('in_progress','paused','submitted','auto_submitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending','in_progress','completed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE external_exam_type AS ENUM ('jee_main','jee_advanced','neet','gate','bitsat','viteee','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. CORE TABLES ───────────────────────────────────────────

-- users
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,
  full_name               TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  mobile                  TEXT NOT NULL,
  password_hash           TEXT NOT NULL,
  role                    user_role    NOT NULL DEFAULT 'student',
  status                  user_status  NOT NULL DEFAULT 'pending_approval',
  email_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  email_verify_token      TEXT,
  email_verify_expiry     TIMESTAMPTZ,
  password_reset_token    TEXT,
  password_reset_expiry   TIMESTAMPTZ,
  email_change_token      TEXT,
  email_change_new_email  TEXT,
  email_change_expiry     TIMESTAMPTZ,
  photo_b2_key            TEXT,
  last_login_at           TIMESTAMPTZ,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- revoked_tokens
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash  TEXT PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- subjects
CREATE TABLE IF NOT EXISTS subjects (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT,
  "order"     INTEGER NOT NULL DEFAULT 0,
  icon_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- chapters
CREATE TABLE IF NOT EXISTS chapters (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT    NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- topics
CREATE TABLE IF NOT EXISTS topics (
  id                  TEXT PRIMARY KEY,
  chapter_id          TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  "order"             INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id    TEXT,
  telegram_message_id TEXT,
  telegram_url        TEXT,
  youtube_url         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- questions
CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  topic_id        TEXT REFERENCES topics(id) ON DELETE SET NULL,
  text            TEXT        NOT NULL,
  options         TEXT[]      NOT NULL,
  correct_option  TEXT        NOT NULL,
  marks           REAL        NOT NULL DEFAULT 4,
  image_url       TEXT,
  text_solution   TEXT,
  video_url       TEXT,
  qr_code_svg     TEXT,
  difficulty      difficulty  NOT NULL DEFAULT 'medium',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- exams
CREATE TABLE IF NOT EXISTS exams (
  id                TEXT PRIMARY KEY,
  title             TEXT      NOT NULL,
  type              exam_type NOT NULL,
  subject_id        TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id        TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  topic_id          TEXT REFERENCES topics(id)   ON DELETE SET NULL,
  duration_minutes  INTEGER   NOT NULL DEFAULT 60,
  passing_score     INTEGER,
  negative_marking  REAL      NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- exam_questions  (junction: exam ↔ question)
CREATE TABLE IF NOT EXISTS exam_questions (
  id          TEXT PRIMARY KEY,
  exam_id     TEXT    NOT NULL REFERENCES exams(id)     ON DELETE CASCADE,
  question_id TEXT    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  "order"     INTEGER NOT NULL DEFAULT 0
);

-- exam_attempts
CREATE TABLE IF NOT EXISTS exam_attempts (
  id                TEXT           PRIMARY KEY,
  user_id           TEXT           NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  exam_id           TEXT           NOT NULL REFERENCES exams(id)    ON DELETE CASCADE,
  status            attempt_status NOT NULL DEFAULT 'in_progress',
  start_time        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  end_time          TIMESTAMPTZ,
  pause_count       INTEGER        NOT NULL DEFAULT 0,
  remaining_seconds INTEGER        NOT NULL DEFAULT 3600,
  resumed_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- attempt_answers
CREATE TABLE IF NOT EXISTS attempt_answers (
  id                    TEXT    PRIMARY KEY,
  attempt_id            TEXT    NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id           TEXT    NOT NULL,
  selected_option       TEXT,
  is_marked_for_review  BOOLEAN NOT NULL DEFAULT FALSE,
  time_spent_seconds    INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- exam_results
CREATE TABLE IF NOT EXISTS exam_results (
  id                TEXT    PRIMARY KEY,
  attempt_id        TEXT    NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id           TEXT    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  exam_id           TEXT    NOT NULL REFERENCES exams(id)         ON DELETE CASCADE,
  score             REAL    NOT NULL DEFAULT 0,
  max_score         REAL    NOT NULL DEFAULT 0,
  accuracy          REAL    NOT NULL DEFAULT 0,
  total_questions   INTEGER NOT NULL DEFAULT 0,
  correct_answers   INTEGER NOT NULL DEFAULT 0,
  incorrect_answers INTEGER NOT NULL DEFAULT 0,
  skipped_answers   INTEGER NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER NOT NULL DEFAULT 0,
  passed            BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- topic_progress  (one row per user×topic)
CREATE TABLE IF NOT EXISTS topic_progress (
  id                    TEXT    PRIMARY KEY,
  user_id               TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  topic_id              TEXT    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  lecture_click_count   INTEGER NOT NULL DEFAULT 0,
  lecture_quiz_passed   BOOLEAN NOT NULL DEFAULT FALSE,
  dpp_completed         BOOLEAN NOT NULL DEFAULT FALSE,
  pyq_completed         BOOLEAN NOT NULL DEFAULT FALSE,
  topic_test_passed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

-- notes  (PDF uploads stored in B2)
CREATE TABLE IF NOT EXISTS notes (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  chapter_id      TEXT    NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  file_name       TEXT    NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  b2_key          TEXT    NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotations     TEXT
);

-- inline_notes  (per-topic rich-text notes)
CREATE TABLE IF NOT EXISTS inline_notes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  topic_id    TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- push_subscriptions  (Web Push / VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pomodoro_sessions
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL,
  topic_context    TEXT,
  topic_id         TEXT REFERENCES topics(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- study_tasks
CREATE TABLE IF NOT EXISTS study_tasks (
  id             TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         task_status NOT NULL DEFAULT 'pending',
  source         task_source NOT NULL DEFAULT 'manual',
  topic_id       TEXT REFERENCES topics(id) ON DELETE SET NULL,
  is_locked      TEXT        NOT NULL DEFAULT 'false',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  scheduled_date DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- external_tests  (mock/competitive exam entries logged by user)
CREATE TABLE IF NOT EXISTS external_tests (
  id                TEXT               PRIMARY KEY,
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

-- qr_scan_logs
CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  exam_id     TEXT,
  result_id   TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_id  TEXT,
  action     TEXT NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- system_config  (key-value store for admin-controlled settings)
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. INDEXES ───────────────────────────────────────────────
-- users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at     ON users(deleted_at);

-- revoked_tokens  (cleanup job filters on expires_at)
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- subjects / chapters / topics  (ordered listing)
CREATE INDEX IF NOT EXISTS idx_subjects_order  ON subjects("order");
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(subject_id);
CREATE INDEX IF NOT EXISTS idx_chapters_order   ON chapters("order");
CREATE INDEX IF NOT EXISTS idx_topics_chapter   ON topics(chapter_id);
CREATE INDEX IF NOT EXISTS idx_topics_order     ON topics("order");

-- questions
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);

-- exams
CREATE INDEX IF NOT EXISTS idx_exams_type       ON exams(type);
CREATE INDEX IF NOT EXISTS idx_exams_subject    ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_chapter    ON exams(chapter_id);
CREATE INDEX IF NOT EXISTS idx_exams_topic      ON exams(topic_id);

-- exam_questions
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam     ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question ON exam_questions(question_id);

-- exam_attempts
CREATE INDEX IF NOT EXISTS idx_attempts_user   ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam   ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON exam_attempts(status);

-- attempt_answers
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON attempt_answers(attempt_id);

-- exam_results
CREATE INDEX IF NOT EXISTS idx_results_user    ON exam_results(user_id);
CREATE INDEX IF NOT EXISTS idx_results_exam    ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_results_attempt ON exam_results(attempt_id);

-- topic_progress
CREATE INDEX IF NOT EXISTS idx_progress_user  ON topic_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_topic ON topic_progress(topic_id);

-- notes
CREATE INDEX IF NOT EXISTS idx_notes_user    ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter ON notes(chapter_id);

-- inline_notes
CREATE INDEX IF NOT EXISTS idx_inline_notes_user  ON inline_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_inline_notes_topic ON inline_notes(topic_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- push_subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- pomodoro_sessions
CREATE INDEX IF NOT EXISTS idx_pomodoro_user ON pomodoro_sessions(user_id);

-- study_tasks
CREATE INDEX IF NOT EXISTS idx_tasks_user           ON study_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date ON study_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON study_tasks(status);

-- external_tests
CREATE INDEX IF NOT EXISTS idx_ext_tests_user ON external_tests(user_id);

-- qr_scan_logs
CREATE INDEX IF NOT EXISTS idx_qr_scans_user     ON qr_scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_scans_question ON qr_scan_logs(question_id);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor    ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at DESC);

-- ── 4. UPDATED_AT TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users','subjects','chapters','topics','questions','exams',
    'exam_attempts','attempt_answers','topic_progress','study_tasks','system_config'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ── 5. ROW LEVEL SECURITY ────────────────────────────────────
-- The backend uses the service-role key (bypasses RLS), so RLS is
-- disabled by default. Enable it below only if you also call
-- Supabase from the frontend with the anon key.

-- ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE subjects        ENABLE ROW LEVEL SECURITY;
-- ... (add policies as needed per table)

-- ── 6. SEED — DEFAULT SYSTEM CONFIG ─────────────────────────
INSERT INTO system_config (key, value, description)
VALUES
  ('low_ctr_threshold', '3',   'Lecture click count below which a topic is considered low engagement'),
  ('maintenance_mode',  'false', 'When true, show maintenance banner on frontend')
ON CONFLICT (key) DO NOTHING;

-- ── DONE ─────────────────────────────────────────────────────
-- All 21 tables, enums, indexes, and triggers are set up.
-- Run this script once. It is fully idempotent (safe to re-run).
