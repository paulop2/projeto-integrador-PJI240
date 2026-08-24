PRAGMA foreign_keys = ON;

-- Better Auth core schema (default model and field names).
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_idx"
  ON "account"("providerId", "accountId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
  ON "verification"("identifier");

CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Server-owned question metadata and answer. Never return correct_option_id to clients.
CREATE TABLE IF NOT EXISTS question_answer_key (
  question_id TEXT PRIMARY KEY NOT NULL,
  exam_id TEXT NOT NULL,
  edition_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'single-choice'),
  correct_option_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS question_answer_key_exam_idx ON question_answer_key(exam_id);
CREATE INDEX IF NOT EXISTS question_answer_key_subject_idx ON question_answer_key(subject_id);

CREATE TABLE IF NOT EXISTS progress_event (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES question_answer_key(question_id),
  type TEXT NOT NULL CHECK (
    type IN ('question_viewed', 'question_answered', 'question_timed_out')
  ),
  local_day TEXT,
  selected_option_id TEXT,
  elapsed_ms INTEGER,
  outcome TEXT CHECK (outcome IN ('correct', 'incorrect', 'timed_out')),
  event_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  UNIQUE (user_id, event_id)
);

-- A second event UUID for the same logical daily view is accepted by the API but
-- does not create another change/statistical view.
CREATE UNIQUE INDEX IF NOT EXISTS progress_event_daily_view_idx
  ON progress_event(user_id, question_id, local_day)
  WHERE type = 'question_viewed';
CREATE INDEX IF NOT EXISTS progress_event_sync_idx
  ON progress_event(user_id, sequence);
CREATE INDEX IF NOT EXISTS progress_event_question_idx
  ON progress_event(question_id);
