import { useEffect, useState } from "react";
import { api } from "../api";

export function SettingsView() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setApiKey(s.apiKey);
      setModel(s.model);
    });
  }, []);

  const save = async () => {
    await api.setSettings({ apiKey: apiKey.trim(), model: model.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2>Settings</h2>
      <p className="sub">
        Your data stays in a local SQLite database. The only thing that leaves this machine is the
        prompt sent to the LLM provider below.
      </p>

      <h3>Anthropic API key</h3>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-..."
      />

      <h3>Model</h3>
      <input type="text" value={model} onChange={(e) => setModel(e.target.value)} />
      {/* TODO (post-MVP): multi-provider LLM support; this becomes a provider + model picker. */}

      <div className="row">
        <button className="btn" onClick={save}>
          Save
        </button>
        {saved && <span className="muted">Saved.</span>}
      </div>
    </div>
  );
}
