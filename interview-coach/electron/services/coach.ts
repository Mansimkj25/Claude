// LLM-driven flows: profile ingestion, JD analysis, practice Q&A + feedback,
// "go deeper" expansion, and live-assist talking points. Every generation goes
// through buildCoachSystemPrompt (voice profile + facts + stories + round type
// + already-used tracker) and through the postprocess backstop before it is
// shown to the user.

import { jsonrepair } from "jsonrepair";
import { createProvider } from "../llm/provider";
import {
  buildCoachSystemPrompt,
  feedbackPrompt,
  goDeeperPrompt,
  ingestionPrompt,
  jdAnalysisPrompt,
  nextQuestionPrompt,
  talkingPointsPrompt,
  type CoachContext
} from "../llm/prompts";
import { cleanGeneratedText, cleanList } from "../llm/postprocess";
import * as store from "./store";
import type {
  Feedback,
  IngestResult,
  JobDescription,
  Requirement,
  Turn
} from "../../shared/types";

function llm() {
  const s = store.getSettings();
  return createProvider(s.apiKey, s.model);
}

// Models sometimes wrap JSON in fences despite instructions, and long outputs
// can be truncated mid-structure or contain small syntax defects (raw
// newlines in strings, dangling escapes). Parse leniently: plain parse first,
// then jsonrepair (fixes defects in place without losing data), then a
// truncate-and-repair loop as a last resort. Exported for tests.
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  if (start === -1) throw new Error(`LLM did not return JSON: ${raw.slice(0, 200)}`);
  const end = unfenced.lastIndexOf("}");
  const candidate = end > start ? unfenced.slice(start, end + 1) : unfenced.slice(start);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    /* fall through to repair */
  }

  let repairable = unfenced.slice(start);
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(jsonrepair(repairable)) as T;
    } catch {
      // jsonrepair couldn't make sense of the tail (e.g. truncated mid-escape).
      // Cut back to the previous structural boundary and try again.
      const cut = Math.max(
        repairable.lastIndexOf(","),
        repairable.lastIndexOf("{"),
        repairable.lastIndexOf("[")
      );
      if (cut <= 0) break;
      repairable = repairable.slice(0, cut);
    }
  }
  throw new Error(`Could not parse LLM response as JSON: ${raw.slice(0, 300)}`);
}

function buildContext(sessionId: number): CoachContext {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`No such session: ${sessionId}`);
  const profile = store.getProfile();
  const jd = session.jdId ? store.getJobDescription(session.jdId) : null;
  return {
    voiceProfile: profile.voiceProfile,
    facts: profile.facts,
    projects: profile.projects,
    stories: profile.stories,
    roundType: session.roundType,
    jdTitle: jd?.title,
    jdText: jd?.rawText,
    requirements: jd?.requirements,
    usedExamples: store.listUsedExampleLabels(sessionId),
    askedQuestions: store.listTurns(sessionId).map((t) => t.question)
  };
}

// ---- profile ingestion ----

interface IngestJson {
  facts?: { category?: string; content?: string }[];
  projects?: { name?: string; description?: string; tech?: string; outcomes?: string }[];
  stories?: {
    title?: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
    tags?: string;
  }[];
  voice_profile?: string;
}

export async function ingestText(
  kind: "resume" | "writeup" | "notes",
  text: string
): Promise<IngestResult> {
  const profile = store.getProfile();
  const raw = await llm().complete({
    system:
      "You extract structured interview-prep data from a candidate's own documents. Be precise and never invent.",
    messages: [{ role: "user", content: ingestionPrompt(kind, text, profile.voiceProfile) }],
    maxTokens: 16000
  });
  const parsed = parseJson<IngestJson>(raw);

  store.appendRawSource(kind, text);

  let factsAdded = 0;
  for (const f of parsed.facts ?? []) {
    if (f.content) {
      store.addFact(f.category || "other", f.content, kind);
      factsAdded++;
    }
  }
  let projectsAdded = 0;
  for (const p of parsed.projects ?? []) {
    if (p.name) {
      store.addProject({
        name: p.name,
        description: p.description ?? "",
        tech: p.tech ?? "",
        outcomes: p.outcomes ?? ""
      });
      projectsAdded++;
    }
  }
  let storiesAdded = 0;
  for (const s of parsed.stories ?? []) {
    if (s.title) {
      store.addStory({
        title: s.title,
        situation: s.situation ?? "",
        task: s.task ?? "",
        action: s.action ?? "",
        result: s.result ?? "",
        tags: s.tags ?? ""
      });
      storiesAdded++;
    }
  }
  const voiceProfile = parsed.voice_profile?.trim() || profile.voiceProfile;
  if (voiceProfile) store.setVoiceProfile(voiceProfile);

  return { voiceProfile, factsAdded, projectsAdded, storiesAdded };
}

// ---- job description analysis ----

interface JdJson {
  title?: string;
  company?: string;
  requirements?: { requirement?: string; strength?: string; evidence?: string }[];
}

export async function analyzeJobDescription(rawText: string): Promise<JobDescription> {
  const profile = store.getProfile();
  const raw = await llm().complete({
    system: "You analyze job descriptions against a candidate's real profile. Be honest about gaps.",
    messages: [
      { role: "user", content: jdAnalysisPrompt(rawText, profile.facts, profile.projects) }
    ],
    maxTokens: 2500
  });
  const parsed = parseJson<JdJson>(raw);
  const requirements: Requirement[] = (parsed.requirements ?? [])
    .filter((r) => r.requirement)
    .map((r) => ({
      requirement: r.requirement!,
      strength: (["strong", "partial", "thin"].includes(r.strength ?? "")
        ? r.strength
        : "partial") as Requirement["strength"],
      evidence: r.evidence ?? ""
    }));
  return store.addJobDescription(parsed.title ?? "", parsed.company ?? "", rawText, requirements);
}

// ---- practice mode ----

export async function nextQuestion(sessionId: number): Promise<Turn> {
  const ctx = buildContext(sessionId);
  const raw = await llm().complete({
    system: buildCoachSystemPrompt(ctx),
    messages: [{ role: "user", content: nextQuestionPrompt() }],
    maxTokens: 500
  });
  const parsed = parseJson<{ question?: string }>(raw);
  if (!parsed.question) throw new Error("LLM returned no question");
  return store.createTurn(sessionId, parsed.question.trim());
}

interface FeedbackJson {
  what_landed?: string;
  what_was_vague?: string;
  stronger_version?: string;
  examples_used?: string[];
  honesty_note?: string | null;
}

export async function submitAnswer(turnId: number, answer: string): Promise<Turn> {
  const turn = store.getTurn(turnId);
  if (!turn) throw new Error(`No such turn: ${turnId}`);
  store.setTurnAnswer(turnId, answer);

  const ctx = buildContext(turn.sessionId);
  const raw = await llm().complete({
    system: buildCoachSystemPrompt(ctx),
    messages: [{ role: "user", content: feedbackPrompt(turn.question, answer) }],
    maxTokens: 2500
  });
  const parsed = parseJson<FeedbackJson>(raw);

  const stronger = cleanGeneratedText(parsed.stronger_version ?? "");
  const flags = [...stronger.flags];
  if (parsed.honesty_note) flags.push(`honesty: ${parsed.honesty_note}`);

  const feedback: Feedback = {
    whatLanded: parsed.what_landed ?? "",
    whatWasVague: parsed.what_was_vague ?? "",
    strongerVersion: stronger.text,
    examplesUsed: (parsed.examples_used ?? []).filter(Boolean),
    flags
  };
  store.setTurnFeedback(turnId, feedback);
  store.recordUsedExamples(turn.sessionId, feedback.examplesUsed);
  return store.getTurn(turnId)!;
}

// "Go deeper" on a turn: must expand with new material, never repeat. The
// already-used tracker in the system prompt plus the previous text in the
// user prompt enforce this from both directions.
export async function goDeeper(turnId: number): Promise<Turn> {
  const turn = store.getTurn(turnId);
  if (!turn) throw new Error(`No such turn: ${turnId}`);
  const previous =
    turn.talkingPoints?.join("\n") ??
    turn.feedback?.strongerVersion ??
    turn.answer ??
    "";
  const ctx = buildContext(turn.sessionId);
  const raw = await llm().complete({
    system: buildCoachSystemPrompt(ctx),
    messages: [{ role: "user", content: goDeeperPrompt(turn.question, previous) }],
    maxTokens: 2000
  });
  const parsed = parseJson<{
    expansion?: string;
    examples_used?: string[];
    honesty_note?: string | null;
  }>(raw);

  const cleaned = cleanGeneratedText(parsed.expansion ?? "");
  const flags = [...cleaned.flags];
  if (parsed.honesty_note) flags.push(`honesty: ${parsed.honesty_note}`);
  const examplesUsed = (parsed.examples_used ?? []).filter(Boolean);

  // Deeper material is stored as a new turn in the same session so the
  // transcript stays linear and the tracker keeps working.
  const newTurn = store.createTurn(turn.sessionId, `(deeper) ${turn.question}`);
  store.setTurnFeedback(newTurn.id, {
    whatLanded: "",
    whatWasVague: "",
    strongerVersion: cleaned.text,
    examplesUsed,
    flags
  });
  store.recordUsedExamples(turn.sessionId, examplesUsed);
  return store.getTurn(newTurn.id)!;
}

// ---- live assist (visible, openly used) ----

export async function liveAssist(sessionId: number, question: string): Promise<Turn> {
  const ctx = buildContext(sessionId);
  const raw = await llm().complete({
    system: buildCoachSystemPrompt(ctx),
    messages: [{ role: "user", content: talkingPointsPrompt(question) }],
    maxTokens: 1200
  });
  const parsed = parseJson<{
    points?: string[];
    grounded_in?: string[];
    honesty_note?: string | null;
  }>(raw);

  const cleaned = cleanList(parsed.points ?? []);
  const turn = store.createTurn(sessionId, question);
  store.setTurnTalkingPoints(turn.id, cleaned.items);
  const flags = [...cleaned.flags];
  if (parsed.honesty_note) flags.push(`honesty: ${parsed.honesty_note}`);
  store.setTurnFeedback(turn.id, {
    whatLanded: "",
    whatWasVague: "",
    strongerVersion: "",
    examplesUsed: parsed.grounded_in ?? [],
    flags
  });
  store.recordUsedExamples(sessionId, parsed.grounded_in ?? []);
  return store.getTurn(turn.id)!;
}
