import { dialog, ipcMain } from "electron";
import fs from "node:fs";
import * as store from "./services/store";
import * as coach from "./services/coach";
import type { Project, RoundType, SessionMode, Settings, Story } from "../shared/types";

export function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:set", (_e, s: Settings) => store.setSettings(s));

  ipcMain.handle("profile:get", () => store.getProfile());
  ipcMain.handle(
    "profile:ingestText",
    async (_e, kind: "resume" | "writeup" | "notes", text: string) => {
      const result = await coach.ingestText(kind, text);
      // Pasted text goes into the knowledge bank too, so the user can always
      // see what the coach's knowledge is based on.
      store.addDocument(`(pasted ${kind})`, kind, text);
      return result;
    }
  );
  ipcMain.handle("profile:uploadDocument", async (_e, kind: "resume" | "writeup" | "notes") => {
    const picked = await dialog.showOpenDialog({
      title: "Select a document (PDF, TXT, or Markdown)",
      filters: [
        { name: "Documents", extensions: ["pdf", "txt", "md", "markdown"] }
        // TODO (post-MVP): .docx support (e.g. via mammoth).
      ],
      properties: ["openFile"]
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const filePath = picked.filePaths[0];
    const fileName = filePath.split(/[\\/]/).pop() ?? "document";
    let text: string;
    if (fileName.toLowerCase().endsWith(".pdf")) {
      // pdf-parse's index.js runs debug code when required directly; import
      // the library entry point instead.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        b: Buffer
      ) => Promise<{ text: string }>;
      text = (await pdfParse(fs.readFileSync(filePath))).text;
    } else {
      text = fs.readFileSync(filePath, "utf-8");
    }
    if (!text.trim()) throw new Error(`No readable text found in ${fileName}`);
    const result = await coach.ingestText(kind, text);
    store.addDocument(fileName, kind, text);
    return { fileName, result };
  });
  ipcMain.handle("documents:list", () => store.listDocuments());
  ipcMain.handle("documents:delete", (_e, id: number) => store.deleteDocument(id));
  ipcMain.handle("profile:updateVoiceProfile", (_e, text: string) => store.setVoiceProfile(text));

  ipcMain.handle("facts:update", (_e, id: number, content: string) => store.updateFact(id, content));
  ipcMain.handle("facts:delete", (_e, id: number) => store.deleteFact(id));
  ipcMain.handle("stories:update", (_e, s: Story) => store.updateStory(s));
  ipcMain.handle("stories:delete", (_e, id: number) => store.deleteStory(id));
  ipcMain.handle("projects:update", (_e, p: Project) => store.updateProject(p));
  ipcMain.handle("projects:delete", (_e, id: number) => store.deleteProject(id));

  ipcMain.handle("jd:create", (_e, rawText: string) => coach.analyzeJobDescription(rawText));
  ipcMain.handle("jd:list", () => store.listJobDescriptions());

  ipcMain.handle("session:start", (_e, jdId: number | null, roundType: RoundType, mode: SessionMode) =>
    store.createSession(jdId, roundType, mode)
  );
  ipcMain.handle("session:listTurns", (_e, sessionId: number) => store.listTurns(sessionId));

  ipcMain.handle("practice:nextQuestion", (_e, sessionId: number) => coach.nextQuestion(sessionId));
  ipcMain.handle("practice:submitAnswer", (_e, turnId: number, answer: string) =>
    coach.submitAnswer(turnId, answer)
  );
  ipcMain.handle("practice:goDeeper", (_e, turnId: number) => coach.goDeeper(turnId));

  ipcMain.handle("assist:talkingPoints", (_e, sessionId: number, question: string) =>
    coach.liveAssist(sessionId, question)
  );
}
