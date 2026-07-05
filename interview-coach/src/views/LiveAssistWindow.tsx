// Live Assist: a small, always-on-top, clearly labeled window for openly
// conducted calls. It is a normal desktop window: visible in screen shares,
// the taskbar, and alt-tab. No hiding behavior, by design.

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSpeechDictation } from "../useSpeechDictation";
import type { JobDescription, RoundType, Session, Turn } from "../../shared/types";

export function LiveAssistWindow() {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [jdId, setJdId] = useState<number | "">("");
  const [round, setRound] = useState<RoundType>("behavioral");
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listJobDescriptions().then((list) => {
      setJds(list);
      if (list.length > 0) setJdId(list[0].id);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const ensureSession = async (): Promise<Session> => {
    if (session) return session;
    const s = await api.startSession(jdId === "" ? null : jdId, round, "live-assist");
    setSession(s);
    return s;
  };

  const busyRef = useRef(busy);
  busyRef.current = busy;

  const askWithText = async (q: string) => {
    if (!q.trim() || busyRef.current) return;
    setBusy(true);
    setError("");
    try {
      const s = await ensureSession();
      const turn = await api.liveAssist(s.id, q.trim());
      setTurns((prev) => [...prev, turn]);
      setQuestion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = () => askWithText(question);

  // Hands-free dictation of the candidate's own mic only (never the
  // interviewer's audio). A finished utterance auto-submits as the question.
  const dictation = useSpeechDictation((finalText) => {
    setQuestion(finalText);
    askWithText(finalText);
  });

  const deeper = async (turnId: number) => {
    setBusy(true);
    setError("");
    try {
      const t = await api.goDeeper(turnId);
      setTurns((prev) => [...prev, t]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="assist-root">
      <div className="assist-banner">
        <strong>Live Assist</strong> — visible assist tool. Talking points from your own
        experience, for you to deliver in your own words.
      </div>

      {!session && (
        <div className="row">
          <select value={jdId} onChange={(e) => setJdId(e.target.value === "" ? "" : Number(e.target.value))} style={{ flex: 1, width: "auto" }}>
            <option value="">No specific job</option>
            {jds.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || "Untitled"} {j.company ? `@ ${j.company}` : ""}
              </option>
            ))}
          </select>
          <select value={round} onChange={(e) => setRound(e.target.value as RoundType)} style={{ width: 130 }}>
            <option value="screen">Screen</option>
            <option value="behavioral">Behavioral</option>
            <option value="technical">Technical</option>
          </select>
        </div>
      )}

      <div className="assist-points">
        {turns.length === 0 && (
          <p className="muted">
            Type the question you were just asked and you'll get 3-5 talking points drawn from your
            profile.
          </p>
        )}
        {turns.map((t) => (
          <div className="card" key={t.id}>
            <div className="qa-question">{t.question}</div>
            {t.talkingPoints && (
              <ul>
                {t.talkingPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            {t.feedback?.strongerVersion && (
              <div className="feedback-block">{t.feedback.strongerVersion}</div>
            )}
            {t.feedback?.flags
              .filter((f) => f.startsWith("honesty:"))
              .map((f, i) => (
                <div className="flag" key={i}>
                  ⚑ {f}
                </div>
              ))}
            <button className="btn small secondary" onClick={() => deeper(t.id)} disabled={busy}>
              Go deeper
            </button>
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {dictation.status === "listening" && (
        <div className="assist-banner listening">
          🎤 Listening (your mic only) — {dictation.interim || "say the question you were just asked…"}
        </div>
      )}
      {dictation.errorMessage && <div className="flag">⚑ {dictation.errorMessage}</div>}

      <div className="assist-input">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="What were you just asked? (Enter to send, or click the mic to speak it)"
        />
        <button
          className={`btn small ${dictation.status === "listening" ? "" : "secondary"}`}
          onClick={() => (dictation.status === "listening" ? dictation.stop() : dictation.start())}
          title="Dictate the question with your own mic (never records the interviewer)"
        >
          {dictation.status === "listening" ? "⏹ Stop" : "🎤 Speak"}
        </button>
        <button className="btn" onClick={ask} disabled={busy || question.trim().length === 0}>
          {busy ? "…" : "Go"}
        </button>
      </div>
      {/*
        TODO (post-MVP): full-call auto-listening (system audio, both sides
        of the call, auto question detection). Deliberately not built here:
        it means recording the interviewer's voice, and call-recording
        consent laws require all-party consent in many jurisdictions. Needs a
        clear per-call consent/disclosure plan before it's added.
      */}
    </div>
  );
}
