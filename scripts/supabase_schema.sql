-- ============================================================
-- EdTech Study Platform — Supabase SQL Schema
-- Generated: 2026-05-23
--
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. Done — all tables, enums, triggers, indexes,
--      RLS policies, and seed data are created.
--
-- NOTES:
--   • users.id is UUID and references auth.users(id)
--   • A trigger auto-creates a user profile on signup
--   • First registered user is automatically super_admin
--   • revoked_tokens table omitted (handled by Supabase Auth)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────
CREATE TYPE user_role         AS ENUM ('super_admin', 'admin', 'student');
CREATE TYPE user_status       AS ENUM ('pending_approval', 'approved', 'suspended', 'banned');
CREATE TYPE difficulty        AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE exam_type         AS ENUM ('lecture_quiz', 'dpp', 'pyq', 'topic_test', 'chapter_test', 'subject_test', 'grand_test', 'drill');
CREATE TYPE attempt_status    AS ENUM ('in_progress', 'paused', 'submitted', 'auto_submitted');
CREATE TYPE task_status       AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
CREATE TYPE task_source       AS ENUM ('auto', 'manual');
CREATE TYPE external_exam_type AS ENUM ('jee_main', 'jee_advanced', 'neet', 'gate', 'bitsat', 'viteee', 'other');


-- ─────────────────────────────────────────────────────────────
-- HELPER: auto-update updated_at on every row change
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────
-- USERS  (profile table — mirrors auth.users)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL UNIQUE,
  mobile         TEXT        NOT NULL DEFAULT '',
  role           user_role   NOT NULL DEFAULT 'student',
  status         user_status NOT NULL DEFAULT 'pending_approval',
  photo_b2_key   TEXT,
  last_login_at  TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger 1: make the very first registered user a super_admin
CREATE OR REPLACE FUNCTION handle_first_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users) = 0 THEN
    NEW.role   := 'super_admin';
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER first_user_super_admin
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION handle_first_user();

-- Trigger 2: auto-create a profile row whenever Supabase Auth creates a user
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, full_name, email, mobile, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    'student',
    'pending_approval'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- ─────────────────────────────────────────────────────────────
-- SUBJECTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE subjects (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  "order"     INTEGER     NOT NULL DEFAULT 0,
  icon_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────────────────────
-- CHAPTERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE chapters (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  subject_id  TEXT        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  "order"     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_chapters_subject_id ON chapters(subject_id);


-- ─────────────────────────────────────────────────────────────
-- TOPICS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE topics (
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

CREATE TRIGGER topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_topics_chapter_id ON topics(chapter_id);


-- ─────────────────────────────────────────────────────────────
-- QUESTIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE questions (
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

CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_questions_topic_id ON questions(topic_id);


-- ─────────────────────────────────────────────────────────────
-- EXAMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE exams (
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

CREATE TRIGGER exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_exams_topic_id   ON exams(topic_id);
CREATE INDEX idx_exams_chapter_id ON exams(chapter_id);
CREATE INDEX idx_exams_subject_id ON exams(subject_id);


-- ─────────────────────────────────────────────────────────────
-- EXAM QUESTIONS  (junction table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE exam_questions (
  id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  exam_id     TEXT    NOT NULL REFERENCES exams(id)     ON DELETE CASCADE,
  question_id TEXT    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  "order"     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_exam_questions_exam_id     ON exam_questions(exam_id);
CREATE INDEX idx_exam_questions_question_id ON exam_questions(question_id);


-- ─────────────────────────────────────────────────────────────
-- EXAM ATTEMPTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE exam_attempts (
  id                TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE TRIGGER exam_attempts_updated_at
  BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_exam_attempts_user_id ON exam_attempts(user_id);
CREATE INDEX idx_exam_attempts_exam_id ON exam_attempts(exam_id);


-- ─────────────────────────────────────────────────────────────
-- ATTEMPT ANSWERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE attempt_answers (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  attempt_id           TEXT        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id          TEXT        NOT NULL,
  selected_option      TEXT,
  is_marked_for_review BOOLEAN     NOT NULL DEFAULT FALSE,
  time_spent_seconds   INTEGER     NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attempt_answers_attempt_id ON attempt_answers(attempt_id);


-- ─────────────────────────────────────────────────────────────
-- EXAM RESULTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE exam_results (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  attempt_id        TEXT        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  exam_id           TEXT        NOT NULL REFERENCES exams(id)         ON DELETE CASCADE,
  score             REAL        NOT NULL DEFAULT 0,
  max_score         REAL        NOT NULL DEFAULT 0,
  accuracy          REAL        NOT NULL DEFAULT 0,
  total_questions   INTEGER     NOT NULL DEFAULT 0,
  correct_answers   INTEGER     NOT NULL DEFAULT 0,
  incorrect_answers INTEGER     NOT NULL DEFAULT 0,
  skipped_answers   INTEGER     NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER    NOT NULL DEFAULT 0,
  passed            BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exam_results_user_id ON exam_results(user_id);
CREATE INDEX idx_exam_results_exam_id ON exam_results(exam_id);


-- ─────────────────────────────────────────────────────────────
-- TOPIC PROGRESS  (SRS gating: one row per user+topic)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE topic_progress (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id              UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
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

CREATE TRIGGER topic_progress_updated_at
  BEFORE UPDATE ON topic_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_topic_progress_user_id  ON topic_progress(user_id);
CREATE INDEX idx_topic_progress_topic_id ON topic_progress(topic_id);


-- ─────────────────────────────────────────────────────────────
-- NOTES  (PDF uploads stored in Backblaze B2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE notes (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  chapter_id      TEXT        NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  file_name       TEXT        NOT NULL,
  file_size_bytes INTEGER     NOT NULL,
  b2_key          TEXT        NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  annotations     TEXT
);

CREATE INDEX idx_notes_user_id    ON notes(user_id);
CREATE INDEX idx_notes_chapter_id ON notes(chapter_id);


-- ─────────────────────────────────────────────────────────────
-- INLINE NOTES  (per-topic scratch pad, Markdown)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE inline_notes (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  topic_id   TEXT        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inline_notes_user_topic ON inline_notes(user_id, topic_id);


-- ─────────────────────────────────────────────────────────────
-- STUDY TASKS  (planner)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE study_tasks (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id        UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         task_status NOT NULL DEFAULT 'pending',
  source         task_source NOT NULL DEFAULT 'manual',
  topic_id       TEXT        REFERENCES topics(id) ON DELETE SET NULL,
  is_locked      TEXT        NOT NULL DEFAULT 'false',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  scheduled_date DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER study_tasks_updated_at
  BEFORE UPDATE ON study_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_study_tasks_user_id        ON study_tasks(user_id);
CREATE INDEX idx_study_tasks_scheduled_date ON study_tasks(scheduled_date);


-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;


-- ─────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  actor_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  target_id  TEXT,
  action     TEXT        NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor_id   ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- POMODORO SESSIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pomodoro_sessions (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_seconds INTEGER     NOT NULL,
  topic_context    TEXT,
  topic_id         TEXT        REFERENCES topics(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pomodoro_user_id ON pomodoro_sessions(user_id);


-- ─────────────────────────────────────────────────────────────
-- EXTERNAL TESTS  (JEE / NEET / GATE score tracker)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE external_tests (
  id                TEXT               PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           UUID               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX idx_external_tests_user_id ON external_tests(user_id);


-- ─────────────────────────────────────────────────────────────
-- QR SCAN LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE qr_scan_logs (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  question_id TEXT        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  exam_id     TEXT,
  result_id   TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_scan_logs_user_id ON qr_scan_logs(user_id);


-- ─────────────────────────────────────────────────────────────
-- PUSH SUBSCRIPTIONS  (Web Push / VAPID)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE push_subscriptions (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);


-- ─────────────────────────────────────────────────────────────
-- SYSTEM CONFIG  (admin key-value settings)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE system_config (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default values
INSERT INTO system_config (key, value, description) VALUES
  ('maintenance_mode',    'false', 'Set to true to put the platform into read-only maintenance mode'),
  ('registration_open',   'true',  'Allow new student self-registration'),
  ('max_attempts_per_day','10',    'Maximum exam attempts a student can make per day'),
  ('passing_percentage',  '60',    'Default passing score percentage for exams'),
  ('streak_grace_hours',  '26',    'Grace period (hours) before a study streak is broken'),
  ('xp_per_pomodoro',     '10',    'XP awarded for completing one Pomodoro session'),
  ('xp_per_quiz_pass',    '50',    'XP awarded for passing a quiz');


-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================

-- Helper: is the current Supabase auth user an admin/super_admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id     = auth.uid()
      AND role   IN ('admin', 'super_admin')
      AND status = 'approved'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ── users ─────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: own read"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users: admin read all"
  ON users FOR SELECT
  USING (is_admin());

CREATE POLICY "users: own update"
  ON users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "users: admin update any"
  ON users FOR UPDATE
  USING (is_admin());

-- The auth trigger runs as SECURITY DEFINER so it bypasses RLS for INSERT.


-- ── subjects ──────────────────────────────────────────────────
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects: authenticated read"
  ON subjects FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "subjects: admin all"
  ON subjects FOR ALL
  USING (is_admin());


-- ── chapters ──────────────────────────────────────────────────
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapters: authenticated read"
  ON chapters FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "chapters: admin all"
  ON chapters FOR ALL
  USING (is_admin());


-- ── topics ────────────────────────────────────────────────────
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics: authenticated read"
  ON topics FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "topics: admin all"
  ON topics FOR ALL
  USING (is_admin());


-- ── questions ─────────────────────────────────────────────────
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions: authenticated read"
  ON questions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "questions: admin all"
  ON questions FOR ALL
  USING (is_admin());


-- ── exams ─────────────────────────────────────────────────────
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exams: authenticated read"
  ON exams FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "exams: admin all"
  ON exams FOR ALL
  USING (is_admin());


-- ── exam_questions ────────────────────────────────────────────
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_questions: authenticated read"
  ON exam_questions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "exam_questions: admin all"
  ON exam_questions FOR ALL
  USING (is_admin());


-- ── exam_attempts ─────────────────────────────────────────────
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_attempts: own read"
  ON exam_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "exam_attempts: own insert"
  ON exam_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "exam_attempts: own update"
  ON exam_attempts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "exam_attempts: admin read all"
  ON exam_attempts FOR SELECT
  USING (is_admin());


-- ── attempt_answers ───────────────────────────────────────────
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempt_answers: own all"
  ON attempt_answers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.id = attempt_answers.attempt_id
        AND exam_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "attempt_answers: admin read"
  ON attempt_answers FOR SELECT
  USING (is_admin());


-- ── exam_results ──────────────────────────────────────────────
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_results: own read"
  ON exam_results FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "exam_results: own insert"
  ON exam_results FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "exam_results: admin read all"
  ON exam_results FOR SELECT
  USING (is_admin());


-- ── topic_progress ────────────────────────────────────────────
ALTER TABLE topic_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topic_progress: own all"
  ON topic_progress FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "topic_progress: admin read"
  ON topic_progress FOR SELECT
  USING (is_admin());


-- ── notes ─────────────────────────────────────────────────────
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes: own all"
  ON notes FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "notes: admin read"
  ON notes FOR SELECT
  USING (is_admin());


-- ── inline_notes ──────────────────────────────────────────────
ALTER TABLE inline_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inline_notes: own all"
  ON inline_notes FOR ALL
  USING (user_id = auth.uid());


-- ── study_tasks ───────────────────────────────────────────────
ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_tasks: own all"
  ON study_tasks FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "study_tasks: admin read"
  ON study_tasks FOR SELECT
  USING (is_admin());


-- ── notifications ─────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own read"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications: own update (mark read)"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "notifications: admin all"
  ON notifications FOR ALL
  USING (is_admin());


-- ── audit_logs ────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: admin read"
  ON audit_logs FOR SELECT
  USING (is_admin());

CREATE POLICY "audit_logs: authenticated insert"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ── pomodoro_sessions ─────────────────────────────────────────
ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pomodoro_sessions: own all"
  ON pomodoro_sessions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "pomodoro_sessions: admin read"
  ON pomodoro_sessions FOR SELECT
  USING (is_admin());


-- ── external_tests ────────────────────────────────────────────
ALTER TABLE external_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_tests: own all"
  ON external_tests FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "external_tests: admin read"
  ON external_tests FOR SELECT
  USING (is_admin());


-- ── qr_scan_logs ──────────────────────────────────────────────
ALTER TABLE qr_scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_scan_logs: own read"
  ON qr_scan_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "qr_scan_logs: own insert"
  ON qr_scan_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "qr_scan_logs: admin read all"
  ON qr_scan_logs FOR SELECT
  USING (is_admin());


-- ── push_subscriptions ────────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: own all"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());


-- ── system_config ─────────────────────────────────────────────
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_config: admin all"
  ON system_config FOR ALL
  USING (is_admin());


-- =============================================================
-- REALTIME  (subscribe to live changes in the frontend)
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE study_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE topic_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE exam_attempts;
