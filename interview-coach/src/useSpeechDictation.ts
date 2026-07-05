// Hands-free dictation via the browser's SpeechRecognition API, scoped to the
// user's own microphone only. This never captures the other side of a call:
// it is for the candidate to repeat or summarize the question they were just
// asked, not for recording the interviewer.
//
// Known limitation: Electron does not ship the Google API key that Chrome's
// built-in SpeechRecognition normally relies on for server-side recognition,
// so on some platforms/Electron builds this reports a "network" error even
// with a working connection and microphone. If that happens, fall back to
// your OS's built-in dictation (macOS: Edit > Start Dictation, or double-tap
// Fn; Windows: Win+H) — it types directly into this same text box.
//
// TODO (post-MVP): full-call auto-listening (capturing system audio from
// both sides of the call, auto-detecting questions, and responding with no
// manual input). That is a materially different feature: it means recording
// the interviewer's voice, and call-recording consent laws vary by state and
// country (many require all-party consent). Don't build it without a clear
// per-call plan for consent/disclosure.

import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export type DictationStatus = "idle" | "listening" | "unsupported" | "error";

const UNSUPPORTED_MESSAGE =
  "Speech recognition isn't available in this build. Use your OS's built-in dictation instead, it types into this box.";
const NETWORK_MESSAGE =
  "Speech recognition couldn't reach the recognition service (a known limitation on some Electron builds). Use your OS's built-in dictation instead if this keeps happening.";
const DENIED_MESSAGE = "Microphone access was denied. Allow microphone access for Interview Coach and try again.";
const FLAKY_MESSAGE =
  "Speech recognition kept dropping the connection. Use your OS's built-in dictation instead.";

export function useSpeechDictation(onFinalText: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [interim, setInterim] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantListeningRef = useRef(false);
  // Chromium ends a recognition session after almost every utterance even
  // with continuous=true, so onend fires constantly during normal, healthy
  // use — that must NOT count against a retry budget, or auto-listen dies
  // silently a few questions into a real interview. Only count restarts that
  // produced zero speech AND happened in rapid succession (a genuine failure
  // loop, e.g. the recognition service is unreachable and dies instantly).
  const emptyFastCyclesRef = useRef(0);
  const gotResultThisCycleRef = useRef(false);
  const lastLaunchAtRef = useRef(0);
  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;

  const launch = useCallback((Ctor: RecognitionCtor) => {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    gotResultThisCycleRef.current = false;
    lastLaunchAtRef.current = Date.now();

    rec.onresult = (e: SpeechRecognitionEvent) => {
      gotResultThisCycleRef.current = true;
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        onFinalTextRef.current(finalText.trim());
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // benign; keep listening
      wantListeningRef.current = false;
      setStatus("error");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setErrorMessage(DENIED_MESSAGE);
      } else if (e.error === "network") {
        setErrorMessage(NETWORK_MESSAGE);
      } else {
        setErrorMessage(`Speech recognition stopped (${e.error}).`);
      }
    };

    rec.onend = () => {
      if (!wantListeningRef.current) {
        setStatus("idle");
        return;
      }
      const cycleMs = Date.now() - lastLaunchAtRef.current;
      if (gotResultThisCycleRef.current || cycleMs > 2000) {
        // A healthy cycle: it either heard speech, or it ran for a while
        // before ending naturally (normal silence timeout). Reset the
        // failure counter and keep listening indefinitely.
        emptyFastCyclesRef.current = 0;
      } else {
        // Ended almost instantly with nothing heard — likely a broken
        // recognition service, not normal behavior.
        emptyFastCyclesRef.current += 1;
      }
      if (emptyFastCyclesRef.current > 8) {
        wantListeningRef.current = false;
        setStatus("error");
        setErrorMessage(FLAKY_MESSAGE);
        return;
      }
      setTimeout(() => {
        if (wantListeningRef.current) launch(Ctor);
      }, 300);
    };

    recognitionRef.current = rec;
    rec.start();
    setStatus("listening");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      setErrorMessage(UNSUPPORTED_MESSAGE);
      return;
    }
    wantListeningRef.current = true;
    emptyFastCyclesRef.current = 0;
    setErrorMessage("");
    launch(Ctor);
  }, [launch]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
    setStatus("idle");
    setInterim("");
  }, []);

  useEffect(
    () => () => {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
    },
    []
  );

  return { status, interim, errorMessage, start, stop };
}
