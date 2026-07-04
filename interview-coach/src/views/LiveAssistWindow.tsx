// Live Assist: a small, always-on-top, clearly labeled window for openly
// conducted calls. It is a normal desktop window: visible in screen shares,
// the taskbar, and alt-tab. No hiding behavior, by design.

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
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

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const s = await ensureSession();
      const turn = await api.liveAssist(s.id, q);
      setTurns((prev) => [...prev, turn]);
      setQuestion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

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

      <div className="assist-input">
        {/* TODO (post-MVP): dictation via SpeechRecognition so the question can be spoken. */}
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="What were you just asked? (Enter to send)"
        />
        <button className="btn" onClick={ask} disabled={busy || question.trim().length === 0}>
          {busy ? "…" : "Go"}
        </button>
      </div>
    </div>
  );
}
