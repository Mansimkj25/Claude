import { contextBridge, ipcRenderer } from "electron";
import type { CoachApi, RoundType, SessionMode, Settings, Story, Project } from "../shared/types";

const api: CoachApi = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (s: Settings) => ipcRenderer.invoke("settings:set", s),

  getProfile: () => ipcRenderer.invoke("profile:get"),
  ingestText: (kind, text) => ipcRenderer.invoke("profile:ingestText", kind, text),
  ingestPdf: () => ipcRenderer.invoke("profile:ingestPdf"),
  updateVoiceProfile: (text: string) => ipcRenderer.invoke("profile:updateVoiceProfile", text),
  updateFact: (id: number, content: string) => ipcRenderer.invoke("facts:update", id, content),
  deleteFact: (id: number) => ipcRenderer.invoke("facts:delete", id),
  updateStory: (story: Story) => ipcRenderer.invoke("stories:update", story),
  deleteStory: (id: number) => ipcRenderer.invoke("stories:delete", id),
  updateProject: (project: Project) => ipcRenderer.invoke("projects:update", project),
  deleteProject: (id: number) => ipcRenderer.invoke("projects:delete", id),

  createJobDescription: (rawText: string) => ipcRenderer.invoke("jd:create", rawText),
  listJobDescriptions: () => ipcRenderer.invoke("jd:list"),

  startSession: (jdId: number | null, roundType: RoundType, mode: SessionMode) =>
    ipcRenderer.invoke("session:start", jdId, roundType, mode),
  listTurns: (sessionId: number) => ipcRenderer.invoke("session:listTurns", sessionId),
  nextQuestion: (sessionId: number) => ipcRenderer.invoke("practice:nextQuestion", sessionId),
  submitAnswer: (turnId: number, answer: string) =>
    ipcRenderer.invoke("practice:submitAnswer", turnId, answer),
  goDeeper: (turnId: number) => ipcRenderer.invoke("practice:goDeeper", turnId),

  liveAssist: (sessionId: number, question: string) =>
    ipcRenderer.invoke("assist:talkingPoints", sessionId, question),
  openLiveAssistWindow: () => ipcRenderer.invoke("window:openLiveAssist")
};

contextBridge.exposeInMainWorld("coach", api);
