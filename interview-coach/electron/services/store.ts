// All SQLite reads/writes. Keeps SQL out of the IPC and coaching layers.

import { getDb } from "../db";
import type {
  Fact,
  Feedback,
  JobDescription,
  KnowledgeDocument,
  Profile,
  Project,
  Requirement,
  RoundType,
  Session,
  SessionMode,
  Settings,
  Story,
  Turn
} from "../../shared/types";

// ---- settings ----

const DEFAULT_MODEL = "claude-sonnet-5";

export function getSettings(): Settings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { apiKey: map.apiKey ?? "", model: map.model || DEFAULT_MODEL };
}

export function setSettings(s: Settings): void {
  const db = getDb();
  const up = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  up.run("apiKey", s.apiKey);
  up.run("model", s.model || DEFAULT_MODEL);
}

// ---- profile ----

export function getProfile(): Profile {
  const db = getDb();
  const row = db
    .prepare("SELECT raw_resume, notes, voice_profile, updated_at FROM profile WHERE id = 1")
    .get() as { raw_resume: string; notes: string; voice_profile: string; updated_at: string | null };
  return {
    rawResume: row.raw_resume,
    notes: row.notes,
    voiceProfile: row.voice_profile,
    updatedAt: row.updated_at,
    facts: listFacts(),
    projects: listProjects(),
    stories: listStories()
  };
}

export function setVoiceProfile(text: string): void {
  getDb()
    .prepare("UPDATE profile SET voice_profile = ?, updated_at = datetime('now') WHERE id = 1")
    .run(text);
}

export function appendRawSource(kind: "resume" | "writeup" | "notes", text: string): void {
  const db = getDb();
  if (kind === "resume") {
    db.prepare("UPDATE profile SET raw_resume = ?, updated_at = datetime('now') WHERE id = 1").run(
      text
    );
  } else {
    const row = db.prepare("SELECT notes FROM profile WHERE id = 1").get() as { notes: string };
    const merged = row.notes ? `${row.notes}\n\n---\n\n${text}` : text;
    db.prepare("UPDATE profile SET notes = ?, updated_at = datetime('now') WHERE id = 1").run(
      merged
    );
  }
}

// ---- facts / projects / stories ----

export function listFacts(): Fact[] {
  return (
    getDb()
      .prepare("SELECT id, category, content, source, created_at AS createdAt FROM facts ORDER BY id")
      .all() as Fact[]
  );
}

export function addFact(category: string, content: string, source: string): void {
  getDb()
    .prepare("INSERT INTO facts (category, content, source) VALUES (?, ?, ?)")
    .run(category, content, source);
}

export function updateFact(id: number, content: string): void {
  getDb().prepare("UPDATE facts SET content = ? WHERE id = ?").run(content, id);
}

export function deleteFact(id: number): void {
  getDb().prepare("DELETE FROM facts WHERE id = ?").run(id);
}

export function listProjects(): Project[] {
  return (
    getDb()
      .prepare(
        "SELECT id, name, description, tech, outcomes, created_at AS createdAt FROM projects ORDER BY id"
      )
      .all() as Project[]
  );
}

export function addProject(p: { name: string; description: string; tech: string; outcomes: string }): void {
  getDb()
    .prepare("INSERT INTO projects (name, description, tech, outcomes) VALUES (?, ?, ?, ?)")
    .run(p.name, p.description, p.tech, p.outcomes);
}

export function updateProject(p: Project): void {
  getDb()
    .prepare("UPDATE projects SET name = ?, description = ?, tech = ?, outcomes = ? WHERE id = ?")
    .run(p.name, p.description, p.tech, p.outcomes, p.id);
}

export function deleteProject(id: number): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function listStories(): Story[] {
  return (
    getDb()
      .prepare(
        "SELECT id, title, situation, task, action, result, tags, created_at AS createdAt FROM stories ORDER BY id"
      )
      .all() as Story[]
  );
}

export function addStory(s: {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO stories (title, situation, task, action, result, tags) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(s.title, s.situation, s.task, s.action, s.result, s.tags);
}

export function updateStory(s: Story): void {
  getDb()
    .prepare(
      "UPDATE stories SET title = ?, situation = ?, task = ?, action = ?, result = ?, tags = ? WHERE id = ?"
    )
    .run(s.title, s.situation, s.task, s.action, s.result, s.tags, s.id);
}

export function deleteStory(id: number): void {
  getDb().prepare("DELETE FROM stories WHERE id = ?").run(id);
}

// ---- knowledge bank documents ----

export function addDocument(fileName: string, kind: string, content: string): void {
  getDb()
    .prepare("INSERT INTO documents (file_name, kind, content) VALUES (?, ?, ?)")
    .run(fileName, kind, content);
}

export function listDocuments(): KnowledgeDocument[] {
  return (
    getDb()
      .prepare(
        "SELECT id, file_name AS fileName, kind, created_at AS createdAt, length(content) AS chars FROM documents ORDER BY id DESC"
      )
      .all() as KnowledgeDocument[]
  );
}

export function deleteDocument(id: number): void {
  getDb().prepare("DELETE FROM documents WHERE id = ?").run(id);
}

// ---- job descriptions ----

interface JdRow {
  id: number;
  title: string;
  company: string;
  raw_text: string;
  requirements: string;
  created_at: string;
}

function jdFromRow(r: JdRow): JobDescription {
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    rawText: r.raw_text,
    requirements: JSON.parse(r.requirements) as Requirement[],
    createdAt: r.created_at
  };
}

export function addJobDescription(
  title: string,
  company: string,
  rawText: string,
  requirements: Requirement[]
): JobDescription {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO job_descriptions (title, company, raw_text, requirements) VALUES (?, ?, ?, ?)"
    )
    .run(title, company, rawText, JSON.stringify(requirements));
  return getJobDescription(Number(info.lastInsertRowid))!;
}

export function getJobDescription(id: number): JobDescription | null {
  const r = getDb().prepare("SELECT * FROM job_descriptions WHERE id = ?").get(id) as
    | JdRow
    | undefined;
  return r ? jdFromRow(r) : null;
}

export function listJobDescriptions(): JobDescription[] {
  const rows = getDb()
    .prepare("SELECT * FROM job_descriptions ORDER BY id DESC")
    .all() as JdRow[];
  return rows.map(jdFromRow);
}

// ---- sessions / turns / used examples ----

export function createSession(jdId: number | null, roundType: RoundType, mode: SessionMode): Session {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO sessions (jd_id, round_type, mode) VALUES (?, ?, ?)")
    .run(jdId, roundType, mode);
  return getSession(Number(info.lastInsertRowid))!;
}

export function getSession(id: number): Session | null {
  const r = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: number; jd_id: number | null; round_type: RoundType; mode: SessionMode; started_at: string }
    | undefined;
  if (!r) return null;
  return { id: r.id, jdId: r.jd_id, roundType: r.round_type, mode: r.mode, startedAt: r.started_at };
}

interface TurnRow {
  id: number;
  session_id: number;
  question: string;
  answer: string | null;
  feedback: string | null;
  talking_points: string | null;
  created_at: string;
}

function turnFromRow(r: TurnRow): Turn {
  return {
    id: r.id,
    sessionId: r.session_id,
    question: r.question,
    answer: r.answer,
    feedback: r.feedback ? (JSON.parse(r.feedback) as Feedback) : null,
    talkingPoints: r.talking_points ? (JSON.parse(r.talking_points) as string[]) : null,
    createdAt: r.created_at
  };
}

export function createTurn(sessionId: number, question: string): Turn {
  const info = getDb()
    .prepare("INSERT INTO turns (session_id, question) VALUES (?, ?)")
    .run(sessionId, question);
  return getTurn(Number(info.lastInsertRowid))!;
}

export function getTurn(id: number): Turn | null {
  const r = getDb().prepare("SELECT * FROM turns WHERE id = ?").get(id) as TurnRow | undefined;
  return r ? turnFromRow(r) : null;
}

export function listTurns(sessionId: number): Turn[] {
  const rows = getDb()
    .prepare("SELECT * FROM turns WHERE session_id = ? ORDER BY id")
    .all(sessionId) as TurnRow[];
  return rows.map(turnFromRow);
}

export function setTurnAnswer(turnId: number, answer: string): void {
  getDb().prepare("UPDATE turns SET answer = ? WHERE id = ?").run(answer, turnId);
}

export function setTurnFeedback(turnId: number, feedback: Feedback): void {
  getDb().prepare("UPDATE turns SET feedback = ? WHERE id = ?").run(JSON.stringify(feedback), turnId);
}

export function setTurnTalkingPoints(turnId: number, points: string[]): void {
  getDb()
    .prepare("UPDATE turns SET talking_points = ? WHERE id = ?")
    .run(JSON.stringify(points), turnId);
}

export function listUsedExampleLabels(sessionId: number): string[] {
  const rows = getDb()
    .prepare("SELECT label FROM used_examples WHERE session_id = ? ORDER BY id")
    .all(sessionId) as { label: string }[];
  return rows.map((r) => r.label);
}

export function recordUsedExamples(sessionId: number, labels: string[], exampleType = "story"): void {
  const db = getDb();
  const existing = new Set(listUsedExampleLabels(sessionId));
  const ins = db.prepare(
    "INSERT INTO used_examples (session_id, example_type, label) VALUES (?, ?, ?)"
  );
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed && !existing.has(trimmed)) {
      ins.run(sessionId, exampleType, trimmed);
      existing.add(trimmed);
    }
  }
}
