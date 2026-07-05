// Types shared between the Electron main process and the React renderer.

export type RoundType = "technical" | "behavioral" | "screen";

export type SessionMode = "practice" | "live-assist";

export interface Settings {
  apiKey: string;
  model: string;
}

export interface Fact {
  id: number;
  category: string; // role | company | dates | project | tech | metric | other
  content: string;
  source: string; // resume | writeup | notes | manual
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  tech: string;
  outcomes: string;
  createdAt: string;
}

export interface Story {
  id: number;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string;
  createdAt: string;
}

export interface Profile {
  rawResume: string;
  notes: string;
  voiceProfile: string;
  updatedAt: string | null;
  facts: Fact[];
  projects: Project[];
  stories: Story[];
}

export interface Requirement {
  requirement: string;
  strength: "strong" | "partial" | "thin";
  evidence: string; // why the app thinks so, grounded in profile facts
}

export interface JobDescription {
  id: number;
  title: string;
  company: string;
  rawText: string;
  requirements: Requirement[];
  createdAt: string;
}

export interface Session {
  id: number;
  jdId: number | null;
  roundType: RoundType;
  mode: SessionMode;
  startedAt: string;
}

export interface UsedExample {
  id: number;
  sessionId: number;
  exampleType: string; // story | project | fact
  label: string;
  createdAt: string;
}

export interface Feedback {
  whatLanded: string;
  whatWasVague: string;
  strongerVersion: string;
  examplesUsed: string[];
  flags: string[]; // post-generation checks that fired (banned opener, em-dash, ...)
}

export interface Turn {
  id: number;
  sessionId: number;
  question: string;
  answer: string | null;
  feedback: Feedback | null;
  talkingPoints: string[] | null; // live-assist turns
  createdAt: string;
}

export interface KnowledgeDocument {
  id: number;
  fileName: string;
  kind: string; // resume | writeup | notes
  createdAt: string;
  chars: number; // content length; full content stays in the DB
}

export interface IngestResult {
  voiceProfile: string;
  factsAdded: number;
  projectsAdded: number;
  storiesAdded: number;
}

export interface TalkingPointsResult {
  points: string[];
  groundedIn: string[]; // which stories/projects the points draw on
  honestyNote: string | null; // set when the profile has no relevant example
  flags: string[];
}

// The API exposed to the renderer via the preload bridge.
export interface CoachApi {
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;

  getProfile(): Promise<Profile>;
  ingestText(kind: "resume" | "writeup" | "notes", text: string): Promise<IngestResult>;
  uploadDocument(
    kind: "resume" | "writeup" | "notes"
  ): Promise<{ fileName: string; result: IngestResult } | null>;
  listDocuments(): Promise<KnowledgeDocument[]>;
  deleteDocument(id: number): Promise<void>;
  updateVoiceProfile(text: string): Promise<void>;
  updateFact(id: number, content: string): Promise<void>;
  deleteFact(id: number): Promise<void>;
  updateStory(story: Story): Promise<void>;
  deleteStory(id: number): Promise<void>;
  updateProject(project: Project): Promise<void>;
  deleteProject(id: number): Promise<void>;

  createJobDescription(rawText: string): Promise<JobDescription>;
  listJobDescriptions(): Promise<JobDescription[]>;

  startSession(jdId: number | null, roundType: RoundType, mode: SessionMode): Promise<Session>;
  listTurns(sessionId: number): Promise<Turn[]>;
  nextQuestion(sessionId: number): Promise<Turn>;
  submitAnswer(turnId: number, answer: string): Promise<Turn>;
  goDeeper(turnId: number): Promise<Turn>;

  liveAssist(sessionId: number, question: string): Promise<Turn>;
  openLiveAssistWindow(): Promise<void>;
}
