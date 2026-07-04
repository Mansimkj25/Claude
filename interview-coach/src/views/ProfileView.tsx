import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Profile } from "../../shared/types";

type IngestKind = "resume" | "writeup" | "notes";

export function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kind, setKind] = useState<IngestKind>("resume");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const p = await api.getProfile();
    setProfile(p);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setStatus(await fn());
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const ingestText = () =>
    run(async () => {
      const r = await api.ingestText(kind, text);
      setText("");
      return `Parsed: ${r.factsAdded} facts, ${r.projectsAdded} projects, ${r.storiesAdded} stories added. Voice profile updated.`;
    });

  const ingestPdf = () =>
    run(async () => {
      const r = await api.ingestPdf();
      if (!r) return "Cancelled.";
      return `Parsed ${r.fileName}: ${r.result.factsAdded} facts, ${r.result.projectsAdded} projects, ${r.result.storiesAdded} stories added.`;
    });

  if (!profile) return <p className="loading">Loading…</p>;

  return (
    <div>
      <h2>My Profile</h2>
      <p className="sub">
        Upload your resume, project write-ups, and notes. The app parses them into facts and
        stories, and learns your voice so suggested answers sound like you.
      </p>

      <div className="card">
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as IngestKind)} style={{ width: 180 }}>
            <option value="resume">Resume (paste text)</option>
            <option value="writeup">Project write-up</option>
            <option value="notes">Free-text notes</option>
          </select>
          <button className="btn secondary" onClick={ingestPdf} disabled={busy}>
            Upload resume PDF…
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your resume, a project write-up, or notes about your experience…"
        />
        <div className="row">
          <button className="btn" onClick={ingestText} disabled={busy || text.trim().length === 0}>
            {busy ? "Parsing…" : "Parse & add to profile"}
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <h3>Voice profile</h3>
      <p className="muted">
        Derived from your writing; injected into every generation so answers sound like you. Edit
        freely.
      </p>
      <textarea
        value={voiceDraft ?? profile.voiceProfile}
        onChange={(e) => setVoiceDraft(e.target.value)}
        placeholder="No voice profile yet. Ingest a document above, or write your own."
      />
      {voiceDraft !== null && voiceDraft !== profile.voiceProfile && (
        <div className="row">
          <button
            className="btn small"
            onClick={async () => {
              await api.updateVoiceProfile(voiceDraft);
              setVoiceDraft(null);
              await reload();
            }}
          >
            Save voice profile
          </button>
        </div>
      )}

      <h3>Facts ({profile.facts.length})</h3>
      {profile.facts.map((f) => (
        <FactRow key={f.id} id={f.id} category={f.category} content={f.content} onChanged={reload} />
      ))}
      {profile.facts.length === 0 && <p className="muted">No facts yet.</p>}

      <h3>Projects ({profile.projects.length})</h3>
      {profile.projects.map((p) => (
        <div className="card" key={p.id}>
          <div className="row">
            <strong>{p.name}</strong>
            <span className="tag">{p.tech}</span>
            <button className="btn small secondary" onClick={async () => { await api.deleteProject(p.id); reload(); }}>
              Delete
            </button>
          </div>
          <div className="muted">{p.description}</div>
          {p.outcomes && <div>Outcomes: {p.outcomes}</div>}
        </div>
      ))}
      {profile.projects.length === 0 && <p className="muted">No projects yet.</p>}

      <h3>Stories ({profile.stories.length})</h3>
      {profile.stories.map((s) => (
        <div className="card" key={s.id}>
          <div className="row">
            <strong>{s.title}</strong>
            {s.tags && <span className="tag">{s.tags}</span>}
            <button className="btn small secondary" onClick={async () => { await api.deleteStory(s.id); reload(); }}>
              Delete
            </button>
          </div>
          <div className="muted">
            {s.situation} → {s.action} → {s.result}
          </div>
        </div>
      ))}
      {profile.stories.length === 0 && <p className="muted">No stories yet.</p>}
    </div>
  );
}

function FactRow(props: { id: number; category: string; content: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.content);

  return (
    <div className="row">
      <span className="tag">{props.category}</span>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ flex: 1, width: "auto" }}
          />
          <button
            className="btn small"
            onClick={async () => {
              await api.updateFact(props.id, draft);
              setEditing(false);
              props.onChanged();
            }}
          >
            Save
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1 }}>{props.content}</span>
          <button className="btn small secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            className="btn small secondary"
            onClick={async () => {
              await api.deleteFact(props.id);
              props.onChanged();
            }}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
