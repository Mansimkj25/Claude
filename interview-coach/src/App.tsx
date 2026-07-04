import { useState } from "react";
import { api } from "./api";
import { ProfileView } from "./views/ProfileView";
import { JobSetupView } from "./views/JobSetupView";
import { PracticeView } from "./views/PracticeView";
import { SettingsView } from "./views/SettingsView";
import type { Session } from "../shared/types";

type Tab = "profile" | "jobs" | "practice" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("profile");
  // A practice session started from Job Setup carries over into the Practice tab.
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Interview Coach</h1>
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
          My Profile
        </button>
        <button className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}>
          Job Setup
        </button>
        <button className={tab === "practice" ? "active" : ""} onClick={() => setTab("practice")}>
          Practice
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Settings
        </button>
        <div className="spacer" />
        <button className="assist-btn" onClick={() => api.openLiveAssistWindow()}>
          Open Live Assist ↗
        </button>
      </nav>
      <main className="content">
        {tab === "profile" && <ProfileView />}
        {tab === "jobs" && (
          <JobSetupView
            onSessionStarted={(s) => {
              setActiveSession(s);
              setTab("practice");
            }}
          />
        )}
        {tab === "practice" && (
          <PracticeView session={activeSession} onSessionChange={setActiveSession} />
        )}
        {tab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
