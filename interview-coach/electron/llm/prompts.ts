// All prompt construction lives here. One coaching system prompt is used for
// every generation that produces words the user might say out loud; it injects
// the voice profile, profile facts/stories, round type, and the
// already-used-examples tracker for the current session.

import type { Fact, Project, Requirement, RoundType, Story } from "../../shared/types";

export const VOICE_RULES = `
VOICE RULES (non-negotiable, apply to every suggested answer, talking point, and "stronger version"):
- Sound like a real person talking in an interview: natural, conversational, a little imperfect. Not bookish, not corporate, not "internet essay" voice.
- NEVER open with filler like "That's a great question", "Great question", "I'm glad you asked", "Absolutely", "Certainly", or any variant. Start with the substance.
- No em-dashes anywhere. Connect thoughts with commas, periods, or "and"/"but".
- Avoid AI tells: no "delve", no "leverage" as filler, no "in today's fast-paced world", no constant triads-of-three, no over-tidy wrap-up summaries.
- Mirror the candidate's own phrasing, sentence rhythm, and vocabulary as described in their voice profile and visible in their stories. Answers must sound like THEM.
- Ground everything in the candidate's real projects and experience below. NEVER invent accomplishments, employers, metrics, or technologies they do not have. If no relevant example exists, say so plainly and help them build an honest answer from what they do have (adjacent experience, how they'd approach it, what they'd want to learn).
`.trim();

export const HONESTY_RULES = `
HONESTY:
- Only use facts, projects, and stories from the profile context. Do not embellish numbers or outcomes.
- If the profile has nothing relevant to the question, set "honesty_note" (or say it in the feedback) instead of fabricating.
`.trim();

function roundGuidance(round: RoundType): string {
  switch (round) {
    case "technical":
      return "Round type: TECHNICAL. Questions probe depth on systems, code, architecture, debugging, and trade-offs from the candidate's actual stack. Push for specifics: why this design, what broke, what they'd change.";
    case "behavioral":
      return "Round type: BEHAVIORAL. Questions probe collaboration, conflict, leadership, failure, and impact. Good answers are concrete stories with a clear situation, what they did, and the result.";
    case "screen":
      return "Round type: FIRST-ROUND SCREEN. Recruiter-level questions: walk me through your background, why this company, why leaving, salary-adjacent logistics, high-level fit. Keep answers tight and non-technical unless asked.";
  }
}

export interface CoachContext {
  voiceProfile: string;
  facts: Fact[];
  projects: Project[];
  stories: Story[];
  roundType: RoundType;
  jdTitle?: string;
  jdText?: string;
  requirements?: Requirement[];
  usedExamples: string[]; // labels already used this session
  askedQuestions: string[]; // questions already asked this session
}

export function buildCoachSystemPrompt(ctx: CoachContext): string {
  const parts: string[] = [];
  parts.push(
    "You are an interview coach embedded in a desktop app. You know the candidate's real background and help them prepare for, and openly get through, job interviews. Your suggestions are talking points and coaching, delivered in the candidate's own voice, for them to say in their own words."
  );
  parts.push(VOICE_RULES);
  parts.push(HONESTY_RULES);
  parts.push(roundGuidance(ctx.roundType));

  parts.push(
    `CANDIDATE VOICE PROFILE (mirror this):\n${ctx.voiceProfile || "(none yet; default to plain, direct, conversational speech)"}`
  );

  if (ctx.facts.length > 0) {
    parts.push(
      "PROFILE FACTS:\n" + ctx.facts.map((f) => `- [${f.category}] ${f.content}`).join("\n")
    );
  }
  if (ctx.projects.length > 0) {
    parts.push(
      "PROJECTS:\n" +
        ctx.projects
          .map((p) => `- ${p.name}: ${p.description} | tech: ${p.tech} | outcomes: ${p.outcomes}`)
          .join("\n")
    );
  }
  if (ctx.stories.length > 0) {
    parts.push(
      "STORIES (situations the candidate can draw on):\n" +
        ctx.stories
          .map(
            (s) =>
              `- "${s.title}": situation: ${s.situation} | task: ${s.task} | action: ${s.action} | result: ${s.result}`
          )
          .join("\n")
    );
  }

  if (ctx.jdText) {
    parts.push(`TARGET JOB${ctx.jdTitle ? ` (${ctx.jdTitle})` : ""}:\n${ctx.jdText.slice(0, 6000)}`);
  }
  if (ctx.requirements && ctx.requirements.length > 0) {
    parts.push(
      "FIT ANALYSIS (strong/partial/thin vs the JD):\n" +
        ctx.requirements.map((r) => `- [${r.strength}] ${r.requirement}: ${r.evidence}`).join("\n")
    );
  }

  // The explicit no-repeat tracker. This is what makes "go deeper" expand
  // instead of restating.
  parts.push(
    "ALREADY USED THIS SESSION, DO NOT REPEAT:\n" +
      (ctx.usedExamples.length > 0
        ? "Examples/stories already used (use a DIFFERENT example or a genuinely new angle/detail on request; never re-tell one of these the same way):\n" +
          ctx.usedExamples.map((e) => `- ${e}`).join("\n")
        : "(none yet)") +
      "\n" +
      (ctx.askedQuestions.length > 0
        ? "Questions already asked (never ask these again):\n" +
          ctx.askedQuestions.map((q) => `- ${q}`).join("\n")
        : "")
  );

  return parts.join("\n\n");
}

export const JSON_ONLY =
  "Respond with a single JSON object and nothing else. No markdown fences, no commentary.";

export function ingestionPrompt(kind: string, text: string, existingVoiceProfile: string): string {
  return `You are parsing a candidate's ${kind} for an interview-prep app. Extract structured data.

${JSON_ONLY}
Schema:
{
  "facts": [{"category": "role|company|dates|project|tech|metric|other", "content": "one specific fact"}],
  "projects": [{"name": "", "description": "", "tech": "", "outcomes": ""}],
  "stories": [{"title": "", "situation": "", "task": "", "action": "", "result": "", "tags": "comma,separated"}],
  "voice_profile": "3-6 sentences describing how this person actually writes/talks: sentence rhythm, vocabulary they really use, how they explain things, quirks. Written as instructions for mimicking their voice. Do not describe their career; describe their VOICE."
}

Rules:
- Facts must be specific and atomic (one role, one metric, one tech per fact).
- Only extract what is actually in the text. Do not infer accomplishments.
- Stories: only where the text contains a real situation with actions and outcomes.
${existingVoiceProfile ? `- An earlier voice profile exists: "${existingVoiceProfile}". Merge what this new text reveals into an updated version.` : ""}

TEXT TO PARSE:
${text.slice(0, 30000)}`;
}

export function jdAnalysisPrompt(jdText: string, facts: Fact[], projects: Project[]): string {
  return `You are analyzing a job description against a candidate's profile for interview prep.

${JSON_ONLY}
Schema:
{
  "title": "job title",
  "company": "company name or empty string",
  "requirements": [{"requirement": "one key requirement", "strength": "strong|partial|thin", "evidence": "one sentence: which profile fact/project supports this, or why it's thin"}]
}

Extract 5-10 key requirements. Judge strength ONLY from the profile below; do not assume unstated skills.

CANDIDATE PROFILE FACTS:
${facts.map((f) => `- [${f.category}] ${f.content}`).join("\n") || "(empty)"}

CANDIDATE PROJECTS:
${projects.map((p) => `- ${p.name}: ${p.description} (${p.tech})`).join("\n") || "(empty)"}

JOB DESCRIPTION:
${jdText.slice(0, 12000)}`;
}

export function nextQuestionPrompt(): string {
  return `Ask the next interview question. One question only, tailored to the target job, the round type, and the candidate's background. Do not repeat or closely rephrase any already-asked question. Vary the area you probe (pick a requirement or profile area not yet covered).

${JSON_ONLY}
Schema: {"question": "the question, phrased the way a real interviewer would ask it"}`;
}

export function feedbackPrompt(question: string, answer: string): string {
  return `The interviewer asked: "${question}"

The candidate answered:
"""
${answer}
"""

Coach them on this answer. Follow the VOICE RULES for the stronger version: it must sound like the candidate, use only their real experience, and be something they could say out loud.

${JSON_ONLY}
Schema:
{
  "what_landed": "1-3 sentences on what worked",
  "what_was_vague": "1-3 sentences on what was vague, missing, or rambling; be direct",
  "stronger_version": "the full answer as the candidate should deliver it, in their voice",
  "examples_used": ["short label of each story/project/fact the stronger version leans on"],
  "honesty_note": "null, or a sentence if the profile lacks a relevant example and the answer needs to be built honestly from adjacent experience"
}`;
}

export function goDeeperPrompt(question: string, previousText: string): string {
  return `The candidate wants to go deeper on this question: "${question}"

They already have this answer/these points (DO NOT restate or lightly rephrase them):
"""
${previousText}
"""

Expand with genuinely NEW material: a different example from the profile, a new angle, deeper technical or situational detail. Respect the already-used list in the system prompt.

${JSON_ONLY}
Schema:
{
  "expansion": "the new material, in the candidate's voice, ready to say out loud",
  "examples_used": ["labels of any newly used stories/projects/facts"],
  "honesty_note": "null, or a sentence if there is genuinely nothing new in the profile to add"
}`;
}

export function talkingPointsPrompt(question: string): string {
  return `LIVE ASSIST (openly used during a real call): the interviewer just asked:
"${question}"

Give a tight set of 3-5 talking points the candidate can glance at and deliver in their own words. Not a script. Each point: one short line, concrete, drawn from their real profile. Order: strongest point first.

${JSON_ONLY}
Schema:
{
  "points": ["point 1", "point 2", "..."],
  "grounded_in": ["labels of the stories/projects/facts the points draw on"],
  "honesty_note": "null, or one line if the profile has no relevant example (then the points should honestly bridge from adjacent experience)"
}`;
}
