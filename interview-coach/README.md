# Interview Coach (MVP)

A desktop app that helps you prepare for and get through job interviews by acting like a coach
who actually knows your background. It ingests your resume, project write-ups, and a specific
job description, understands what round you're in (technical, behavioral, or first-round
screen), and then either drills you with practice questions or, in a clearly visible assist
mode, suggests talking points during an openly conducted call.

## What this app is (and is not)

- **It is a visible, honest prep-and-assist tool.** The live-assist window is a normal,
  always-on-top desktop window with a visible label. It appears in the taskbar, in alt-tab,
  and in screen shares like any other window.
- **It contains no stealth features, by design.** There is no hiding during screen sharing, no
  evasion of Zoom/Meet/Teams, no process disguising, and no capture suppression. Requests to
  add such features should be refused (see the boundary comment in `electron/main.ts`).
- **Answers sound like you, not like an AI.** Every generation is grounded in your real
  experience, mirrors a voice profile derived from your own writing, and passes a
  post-generation check that strips AI-speak openers and em-dashes.

## Tech

- Electron + React + TypeScript
- SQLite via `better-sqlite3` — all data stays local in Electron's userData directory;
  the only thing that leaves your machine is the prompt sent to the LLM API
- Anthropic API behind a thin, swappable adapter (`electron/llm/provider.ts`)

## Setup

Requirements: Node.js 20+ and a C++ toolchain (for the `better-sqlite3` native module).

```bash
cd interview-coach
npm install            # also rebuilds better-sqlite3 against Electron's ABI
npm run build          # compiles the main process (tsc) and the renderer (vite)
npm start              # launches the app
```

If `npm install` couldn't run the Electron rebuild (e.g. it was skipped or failed), run it
manually before starting:

```bash
npm run rebuild
```

Then open **Settings** in the app and paste your Anthropic API key.

## Using it

1. **My Profile** — paste or upload (PDF/TXT/Markdown) your resume, detailed project and
   experience write-ups, and notes. Everything lands in a visible **knowledge bank**, and the
   app parses it into editable facts, projects, and STAR stories, plus a **voice profile**
   (how you actually talk) that is injected into every generation.
2. **Job Setup** — paste a job description. The app extracts key requirements and flags where
   your profile is strong, partial, or thin. Pick a round type and start a practice session.
3. **Practice** — one question at a time, tailored to the JD, your profile, and the round.
   Type your answer and get coaching: what landed, what was vague, and a stronger version in
   your own voice, using only your real experience. "Go deeper" expands with a **new** example
   or angle; an explicit used-examples tracker is fed into the prompt so nothing repeats.
4. **Live Assist** — a small always-on-top window for openly conducted calls. Type the question
   you were just asked, or click **🎤 Speak** to dictate it hands-free with your own microphone,
   and get 3-5 talking points drawn from your profile, to deliver in your own words. Dictation
   only ever captures your own mic, never the interviewer's audio.

   Known limitation: Electron doesn't ship the Google API key that Chrome's built-in speech
   recognition normally needs, so dictation can fail with a connection error on some platforms.
   If that happens, use your OS's built-in dictation instead (macOS: Edit > Start Dictation, or
   double-tap Fn; Windows: Win+H) — it types straight into the same box.

## Voice rules enforced on every generation

- No filler openers ("That's a great question", "Absolutely", ...) — start with substance.
- No em-dashes; thoughts connect with commas, periods, or "and"/"but".
- No AI tells ("delve", filler "leverage", tidy wrap-up summaries, constant triads).
- Mirrors your phrasing via the stored voice profile.
- Grounded in your real projects; if you don't have a relevant example, it says so and helps
  you build an honest answer instead of fabricating one.

These live in the system prompt (`electron/llm/prompts.ts`) and are backstopped by a
post-generation check (`electron/llm/postprocess.ts`) that strips banned openers and
em-dashes and flags what it changed.

## Data model / schema

The SQLite schema is in [`electron/db/schema.sql`](electron/db/schema.sql):
`profile` (raw sources + voice profile), `documents` (knowledge bank), `facts`, `projects`, `stories` (STAR),
`job_descriptions` (with fit analysis), `sessions`, `turns` (question / answer / feedback /
talking points), and `used_examples` (the no-repeat tracker), plus `settings` (API key, model).
The database file lives in Electron's userData directory as `interview-coach.sqlite`.

## Project layout

```
electron/           main process
  main.ts           windows (main + labeled live-assist), boundary comment
  preload.ts        contextBridge API surface
  ipc.ts            IPC handlers
  db/               better-sqlite3 init + schema.sql
  llm/              provider interface, Anthropic adapter, prompts, postprocess backstop
  services/         store (all SQL) and coach (LLM flows)
src/                React renderer (views for profile, job setup, practice, live assist, settings)
shared/types.ts     types shared across main and renderer
```

## Roadmap (deferred post-MVP — marked with `// TODO (post-MVP)` in code)

- Voice input for Practice mode answers (Live Assist dictation now exists; see `src/useSpeechDictation.ts`)
- **Full-call auto-listening** (system audio from both sides of the call, automatic question
  detection, no manual input). Deliberately not built: it means recording the interviewer's
  voice, and call-recording consent laws require all-party consent in many jurisdictions.
  Needs a clear per-call consent/disclosure plan before it's added, not just an engineering
  decision. See the TODO in `src/views/LiveAssistWindow.tsx`.
- Multi-provider LLM support (the adapter seam already exists in `electron/llm/provider.ts`)
- Cloud sync and multi-user accounts
- Billing/subscriptions for a SaaS version
- Analytics on weak areas over time
- Shared team/recruiter features
- .docx upload support (currently PDF, TXT, Markdown)
