import { useEffect, useState } from "react";
import { api } from "../api";
import type { Session, Turn } from "../../shared/types";

export function PracticeView(props: {
  session: Session | null;
  onSessionChange: (s: Session) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const session = props.session;
  const currentTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const awaitingAnswer = currentTurn !== null && currentTurn.answer === null && !currentTurn.question.startsWith("(deeper)");

  useEffect(() => {
    if (session) api.listTurns(session.id).then(setTurns);
    else setTurns([]);
  }, [session]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = () =>
    run(async () => {
      const t = await api.nextQuestion(session!.id);
      setTurns((prev) => [...prev, t]);
    });

  const submit = () =>
    run(async () => {
      const updated = await api.submitAnswer(currentTurn!.id, answer);
      setTurns((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setAnswer("");
    });

  const deeper = (turnId: number) =>
    run(async () => {
      const t = await api.goDeeper(turnId);
      setTurns((prev) => [...prev, t]);
    });

  if (!session) {
    return (
      <div>
        <h2>Practice</h2>
        <p className="sub">No active session. Go to Job Setup, pick a job and round type, and start one.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Practice — {session.roundType} round</h2>
      <p className="sub">
        One question at a time, tailored to the job and your profile. Type your answer (voice input
        is on the roadmap) and get coaching back.
        {/* TODO (post-MVP): voice input via SpeechRecognition for answering out loud. */}
      </p>

      {turns.map((t) => (
        <div className="card" key={t.id}>
          <div className="qa-question">{t.question}</div>
          {t.answer && (
            <div className="feedback-block">
              <span className="muted">Your answer:</span>
              {"\n"}
              {t.answer}
            </div>
          )}
          {t.feedback && (
            <>
              {t.feedback.whatLanded && (
                <div className="feedback-block">
                  <strong style={{ color: "var(--good)" }}>What landed:</strong> {t.feedback.whatLanded}
                </div>
              )}
              {t.feedback.whatWasVague && (
                <div className="feedback-block">
                  <strong style={{ color: "var(--warn)" }}>What was vague:</strong>{" "}
                  {t.feedback.whatWasVague}
                </div>
              )}
              {t.feedback.strongerVersion && (
                <div className="feedback-block">
                  <strong style={{ color: "var(--accent)" }}>
                    {t.question.startsWith("(deeper)") ? "Going deeper:" : "A stronger version, in your voice:"}
                  </strong>
                  {"\n"}
                  {t.feedback.strongerVersion}
                </div>
              )}
              {t.feedback.examplesUsed.length > 0 && (
                <div>
                  {t.feedback.examplesUsed.map((e) => (
                    <span className="tag" key={e}>
                      used: {e}
                    </span>
                  ))}
                </div>
              )}
              {t.feedback.flags.map((f, i) => (
                <div className="flag" key={i}>
                  ⚑ {f}
                </div>
              ))}
              <div className="row">
                <button className="btn small secondary" onClick={() => deeper(t.id)} disabled={busy}>
                  Go deeper (new example, no repeats)
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {error && <div className="error">{error}</div>}

      {awaitingAnswer ? (
        <div className="card">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer as you would say it out loud…"
          />
          <div className="row">
            <button className="btn" onClick={submit} disabled={busy || answer.trim().length === 0}>
              {busy ? "Coaching…" : "Submit answer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={ask} disabled={busy}>
            {busy ? "Thinking…" : turns.length === 0 ? "Ask me the first question" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
