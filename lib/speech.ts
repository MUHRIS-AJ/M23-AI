"use client";

// Speech-to-text (mic) and text-to-speech (playback) with a browser-native
// primary path and a cloud (OpenAI-compatible) fallback.
//
// STT: Web Speech API (SpeechRecognition) when available; otherwise MediaRecorder
//      → POST /api/speech/transcribe (needs an allocated OpenAI/custom key).
// TTS: browser speechSynthesis voices (many, free, no key) plus cloud OpenAI
//      voices when an OpenAI-compatible key is allocated. The user picks a voice
//      and the right path is chosen from the voice's `kind`.
//
// All capabilities degrade gracefully: if neither path works the matching
// *Supported flag is false and the UI should disable/hide the control.

import * as React from "react";

// ── voice model ───────────────────────────────────────────────
export type VoiceKind = "browser" | "cloud";

export interface SpeechVoiceOption {
  /** Stable id: "browser:<voiceURI>" or "cloud:<name>". */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  kind: VoiceKind;
  /** BCP-47 tag for browser voices (e.g. "en-US"); undefined for cloud. */
  lang?: string;
}

// OpenAI-compatible cloud voices (used only when a cloud key is available).
const CLOUD_VOICES: { name: string; label: string }[] = [
  { name: "alloy", label: "Alloy — balanced" },
  { name: "echo", label: "Echo — warm" },
  { name: "fable", label: "Fable — expressive" },
  { name: "onyx", label: "Onyx — deep" },
  { name: "nova", label: "Nova — bright" },
  { name: "shimmer", label: "Shimmer — soft" },
];

const VOICE_STORAGE_KEY = "speech.voiceId";
const RATE_STORAGE_KEY = "speech.rate";
const AUTOSPEAK_STORAGE_KEY = "speech.autoSpeak";

export interface UseSpeechOptions {
  /** Called with transcribed text (final result) from either STT path. */
  onTranscript?: (text: string) => void;
}

export interface UseSpeech {
  // STT
  listening: boolean;
  sttSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  // TTS
  speaking: boolean;
  ttsSupported: boolean;
  speakingId: string | null;
  speak: (text: string, id?: string) => Promise<void>;
  stopSpeaking: () => void;
  // Voice selection
  voices: SpeechVoiceOption[];
  selectedVoiceId: string;
  setVoice: (id: string) => void;
  rate: number;
  setRate: (rate: number) => void;
  /** When true, callers should speak assistant replies automatically. */
  autoSpeak: boolean;
  setAutoSpeak: (on: boolean) => void;
}

export function useSpeech(opts: UseSpeechOptions = {}): UseSpeech {
  const { onTranscript } = opts;

  const [listening, setListening] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [speakingId, setSpeakingId] = React.useState<string | null>(null);
  const [cloud, setCloud] = React.useState({ stt: false, tts: false });

  // Voice catalog + selection.
  const [browserVoices, setBrowserVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState<string>("");
  const [rate, setRateState] = React.useState<number>(1);
  const [autoSpeak, setAutoSpeakState] = React.useState<boolean>(false);

  // Keep the latest onTranscript without re-creating recognition handlers.
  const onTranscriptRef = React.useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaChunksRef = React.useRef<Blob[]>([]);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // ── capability detection ────────────────────────────────────
  const browserStt =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const browserTts =
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
  const canRecord =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined";

  // Ask the server once whether a cloud speech key is available.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/speech/config")
      .then((r) => (r.ok ? r.json() : { cloudStt: false, cloudTts: false }))
      .then((j) => {
        if (!cancelled) setCloud({ stt: !!j.cloudStt, tts: !!j.cloudTts });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Enumerate browser voices (they load asynchronously in most browsers).
  React.useEffect(() => {
    if (!browserTts) return;
    const load = () => setBrowserVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [browserTts]);

  // Restore persisted preferences once.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(VOICE_STORAGE_KEY);
      if (v) setSelectedVoiceId(v);
      const r = window.localStorage.getItem(RATE_STORAGE_KEY);
      if (r) setRateState(Math.min(2, Math.max(0.5, parseFloat(r) || 1)));
      const a = window.localStorage.getItem(AUTOSPEAK_STORAGE_KEY);
      if (a) setAutoSpeakState(a === "1");
    } catch {
      /* localStorage unavailable — use defaults */
    }
  }, []);

  // ── combined voice list ─────────────────────────────────────
  const voices = React.useMemo<SpeechVoiceOption[]>(() => {
    const list: SpeechVoiceOption[] = [];
    for (const v of browserVoices) {
      list.push({
        id: `browser:${v.voiceURI}`,
        label: v.name + (v.lang ? ` (${v.lang})` : ""),
        kind: "browser",
        lang: v.lang,
      });
    }
    if (cloud.tts) {
      for (const c of CLOUD_VOICES) {
        list.push({ id: `cloud:${c.name}`, label: `☁ ${c.label}`, kind: "cloud" });
      }
    }
    return list;
  }, [browserVoices, cloud.tts]);

  // Resolve the effective voice option (selected, else first browser, else first).
  const effectiveVoice = React.useMemo<SpeechVoiceOption | null>(() => {
    if (selectedVoiceId) {
      const found = voices.find((v) => v.id === selectedVoiceId);
      if (found) return found;
    }
    return voices.find((v) => v.kind === "browser") ?? voices[0] ?? null;
  }, [voices, selectedVoiceId]);

  const sttSupported = browserStt || (canRecord && cloud.stt);
  const ttsSupported = browserTts || cloud.tts;

  // ── preference setters (persist) ────────────────────────────
  const setVoice = React.useCallback((id: string) => {
    setSelectedVoiceId(id);
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, id);
    } catch {
      /* noop */
    }
  }, []);

  const setRate = React.useCallback((r: number) => {
    const clamped = Math.min(2, Math.max(0.5, r));
    setRateState(clamped);
    try {
      window.localStorage.setItem(RATE_STORAGE_KEY, String(clamped));
    } catch {
      /* noop */
    }
  }, []);

  const setAutoSpeak = React.useCallback((on: boolean) => {
    setAutoSpeakState(on);
    try {
      window.localStorage.setItem(AUTOSPEAK_STORAGE_KEY, on ? "1" : "0");
    } catch {
      /* noop */
    }
  }, []);

  // ── cleanup on unmount ──────────────────────────────────────
  React.useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();
    };
  }, []);

  // ── cloud STT via MediaRecorder ─────────────────────────────
  const startCloudRecording = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(mediaChunksRef.current, { type: "audio/webm" });
        setListening(false);
        if (blob.size === 0) return;
        try {
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          const res = await fetch("/api/speech/transcribe", {
            method: "POST",
            body: form,
          });
          if (res.ok) {
            const { text } = (await res.json()) as { text?: string };
            if (text) onTranscriptRef.current?.(text);
          }
        } catch {
          /* swallow — UI shows nothing transcribed */
        }
      };

      recorder.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  // ── start / stop listening (picks the right path) ───────────
  const startListening = React.useCallback(() => {
    if (listening) return;

    if (browserStt) {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) return;
      const recognition = new Ctor();
      recognition.lang =
        typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalText = "";
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript ?? "";
          if (res.isFinal) finalText += transcript;
          else interim += transcript;
        }
        const combined = (finalText + interim).trim();
        if (combined) onTranscriptRef.current?.(combined);
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        setListening(false);
      }
      return;
    }

    // Cloud fallback: record then transcribe on stop.
    if (canRecord && cloud.stt) {
      void startCloudRecording();
    }
  }, [listening, browserStt, canRecord, cloud.stt, startCloudRecording]);

  const stopListening = React.useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop(); // triggers onstop → transcription
      mediaRecorderRef.current = null;
    }
    setListening(false);
  }, []);

  // ── text-to-speech ──────────────────────────────────────────
  const stopSpeaking = React.useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
    setSpeakingId(null);
  }, []);

  // Stable refs so `speak` doesn't churn its identity on every voice/rate change.
  const browserVoicesRef = React.useRef(browserVoices);
  browserVoicesRef.current = browserVoices;
  const effectiveVoiceRef = React.useRef(effectiveVoice);
  effectiveVoiceRef.current = effectiveVoice;
  const rateRef = React.useRef(rate);
  rateRef.current = rate;

  const speak = React.useCallback(
    async (text: string, id?: string) => {
      const clean = text.trim();
      if (!clean) return;

      // Toggle off if the same message is already playing.
      if (speaking && id && id === speakingId) {
        stopSpeaking();
        return;
      }
      stopSpeaking();

      const voice = effectiveVoiceRef.current;
      const useCloud = voice?.kind === "cloud";

      // Browser path (default): synth voice + rate applied.
      if (!useCloud && browserTts) {
        const utter = new SpeechSynthesisUtterance(clean);
        utter.rate = rateRef.current;
        if (voice?.kind === "browser") {
          const match = browserVoicesRef.current.find(
            (v) => `browser:${v.voiceURI}` === voice.id
          );
          if (match) {
            utter.voice = match;
            utter.lang = match.lang;
          }
        }
        utter.onend = () => {
          setSpeaking(false);
          setSpeakingId(null);
        };
        utter.onerror = () => {
          setSpeaking(false);
          setSpeakingId(null);
        };
        setSpeaking(true);
        setSpeakingId(id ?? null);
        window.speechSynthesis.speak(utter);
        return;
      }

      // Cloud path: stream mp3 from the selected OpenAI voice.
      if (cloud.tts) {
        try {
          setSpeaking(true);
          setSpeakingId(id ?? null);
          const cloudVoice = voice?.kind === "cloud" ? voice.id.slice("cloud:".length) : undefined;
          const res = await fetch("/api/speech/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean, voice: cloudVoice }),
          });
          if (!res.ok) throw new Error("tts failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setSpeaking(false);
            setSpeakingId(null);
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            setSpeaking(false);
            setSpeakingId(null);
          };
          await audio.play();
        } catch {
          setSpeaking(false);
          setSpeakingId(null);
        }
      }
    },
    [speaking, speakingId, browserTts, cloud.tts, stopSpeaking]
  );

  return {
    listening,
    sttSupported,
    startListening,
    stopListening,
    speaking,
    ttsSupported,
    speakingId,
    speak,
    stopSpeaking,
    voices,
    selectedVoiceId: effectiveVoice?.id ?? "",
    setVoice,
    rate,
    setRate,
    autoSpeak,
    setAutoSpeak,
  };
}

/** Remove markdown image embeds, links, and code fences so TTS reads clean prose. */
export function stripMarkdownForSpeech(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ![alt](dataUri) — never read out data URIs
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/```[\s\S]*?```/g, " code block ") // fenced code
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/[*_#>]/g, "") // md emphasis/heading marks
    .replace(/\s+/g, " ")
    .trim();
}
