import { useEffect, useState } from "react";
import { api } from "../api";
import type { JobDescription, RoundType, Session } from "../../shared/types";

const ROUNDS: { value: RoundType; label: string }[] = [
  { value: "screen", label: "First-round screen" },
  { value: "behavioral", label: "Behavioral" },
  { value: "technical", label: "Technical" }
];

export function JobSetupView(props: { onSessionStarted: (s: Session) => void }) {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [jdText, setJdText] = useState("");
  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [round, setRound] = useState<RoundType>("behavioral");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listJobDescriptions().then((list) => {
      setJds(list);
      if (list.length > 0) setSelectedJd(list[0]);
    });
  }, []);

  const analyze = async () => {
    setBusy(true);
    setError("");
    try {
      const jd = await api.createJobDescription(jdText);
      setJds([jd, ...jds]);
      setSelectedJd(jd);
      setJdText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startPractice = async () => {
    if (!selectedJd) return;
    const session = await api.startSession(selectedJd.id, round, "practice");
    props.onSessionStarted(session);
  };

  return (
    <div>
      <h2>Job Setup</h2>
      <p className="sub">
        Paste a job description. The app extracts the key requirements and maps them against your
        profile: where you're strong, where you're thin.
      </p>

      <div className="card">
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the job description…"
        />
        <div className="row">
          <button className="btn" onClick={analyze} disabled={busy || jdText.trim().length === 0}>
            {busy ? "Analyzing…" : "Analyze against my profile"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {jds.length > 0 && (
        <>
          <h3>Saved jobs</h3>
          <div className="row">
            <select
              value={selectedJd?.id ?? ""}
              onChange={(e) => setSelectedJd(jds.find((j) => j.id === Number(e.target.value)) ?? null)}
            >
              {jds.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "Untitled"} {j.company ? `@ ${j.company}` : ""}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {selectedJd && (
        <>
          <h3>
            Fit: {selectedJd.title || "Untitled"} {selectedJd.company && `@ ${selectedJd.company}`}
          </h3>
          {selectedJd.requirements.map((r, i) => (
            <div className="card" key={i}>
              <span className={`tag ${r.strength}`}>{r.strength}</span>
              <strong>{r.requirement}</strong>
              <div className="muted">{r.evidence}</div>
            </div>
          ))}

          <h3>Start a practice session</h3>
          <div className="row">
            <select value={round} onChange={(e) => setRound(e.target.value as RoundType)} style={{ width: 220 }}>
              {ROUNDS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button className="btn" onClick={startPractice}>
              Start practice →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
