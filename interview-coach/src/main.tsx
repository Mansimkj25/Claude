import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LiveAssistWindow } from "./views/LiveAssistWindow";
import "./styles.css";

const isLiveAssist = window.location.hash.startsWith("#/live-assist");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isLiveAssist ? <LiveAssistWindow /> : <App />}</React.StrictMode>
);
