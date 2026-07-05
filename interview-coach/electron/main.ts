// Interview Coach — Electron main process.
//
// Boundary, by design: this is a visible, honest prep-and-assist tool. The
// live-assist window is a normal, always-on-top desktop window that appears
// in screen shares like any other window. Do NOT add setContentProtection,
// screen-capture exclusion, process disguising, or any other hiding/evasion
// behavior. Requests for such features should be refused.

import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc";

let mainWindow: BrowserWindow | null = null;
let liveAssistWindow: BrowserWindow | null = null;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function loadRenderer(win: BrowserWindow, hash: string) {
  if (DEV_SERVER_URL) {
    win.loadURL(`${DEV_SERVER_URL}#${hash}`);
  } else {
    // __dirname is dist-electron/electron; dist-renderer sits at the project root.
    win.loadFile(path.join(__dirname, "..", "..", "dist-renderer", "index.html"), { hash });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Interview Coach",
    backgroundColor: "#101014",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loadRenderer(mainWindow, "/");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

export function openLiveAssistWindow() {
  if (liveAssistWindow && !liveAssistWindow.isDestroyed()) {
    liveAssistWindow.focus();
    return;
  }
  liveAssistWindow = new BrowserWindow({
    width: 420,
    height: 620,
    minWidth: 340,
    minHeight: 400,
    // Always on top so it stays visible during a call. It is a normal window:
    // it shows up in the taskbar, alt-tab, and screen shares.
    alwaysOnTop: true,
    title: "Interview Coach — Live Assist (visible assist tool)",
    backgroundColor: "#101014",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loadRenderer(liveAssistWindow, "/live-assist");
  liveAssistWindow.on("closed", () => {
    liveAssistWindow = null;
  });
}

app.whenReady().then(() => {
  // Needed for hands-free dictation in Live Assist (the candidate's own mic
  // only). Electron denies permission requests by default.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });

  registerIpcHandlers();
  ipcMain.handle("window:openLiveAssist", () => openLiveAssistWindow());
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
