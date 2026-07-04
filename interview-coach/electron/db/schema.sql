-- Interview Coach — SQLite schema.
-- All data stays local (Electron userData dir). Nothing leaves the machine
-- except the prompts sent to the configured LLM provider.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Single-row profile: raw source material plus the derived voice profile.
CREATE TABLE IF NOT EXISTS profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  raw_resume    TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  voice_profile TEXT NOT NULL DEFAULT '',
  updated_at    TEXT
);

-- Structured facts extracted from the resume/write-ups/notes. User-editable.
CREATE TABLE IF NOT EXISTS facts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL,             -- role | company | dates | project | tech | metric | other
  content    TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'manual', -- resume | writeup | notes | manual
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tech        TEXT NOT NULL DEFAULT '',
  outcomes    TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- STAR-shaped stories the user can draw on in answers.
CREATE TABLE IF NOT EXISTS stories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  situation  TEXT NOT NULL DEFAULT '',
  task       TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL DEFAULT '',
  result     TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_descriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL DEFAULT '',
  company      TEXT NOT NULL DEFAULT '',
  raw_text     TEXT NOT NULL,
  requirements TEXT NOT NULL DEFAULT '[]', -- JSON: [{requirement, strength, evidence}]
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jd_id      INTEGER REFERENCES job_descriptions(id),
  round_type TEXT NOT NULL,               -- technical | behavioral | screen
  mode       TEXT NOT NULL,               -- practice | live-assist
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One turn = one question, plus (depending on mode) the user's answer and
-- coaching feedback, or the live-assist talking points.
CREATE TABLE IF NOT EXISTS turns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions(id),
  question       TEXT NOT NULL,
  answer         TEXT,
  feedback       TEXT,                    -- JSON Feedback
  talking_points TEXT,                    -- JSON string[]
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Explicit tracker of examples/stories already used, fed back into prompts so
-- the model does not repeat itself within or across turns of a session.
CREATE TABLE IF NOT EXISTS used_examples (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  example_type TEXT NOT NULL,             -- story | project | fact
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_used_examples_session ON used_examples(session_id);
