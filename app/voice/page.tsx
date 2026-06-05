"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { ArrowLeft, Mic, Square, Loader2 } from "lucide-react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { useSpeech } from "@/lib/speech";
import { VoicePicker } from "@/components/ui/voice-picker";
import type { ChatModel } from "@/components/ui/claude-style-chat-input";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export default function VoiceModePage() {
  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [voiceState, setVoiceState] = React.useState<VoiceState>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [banner, setBanner] = React.useState<string | null>(null);

  const selectedModelRef = React.useRef("");
  selectedModelRef.current = selectedModel;
  const transcriptRef = React.useRef("");
  transcriptRef.current = transcript;

  // Speech: STT feeds the transcript; TTS speaks the assistant reply.
  const speech = useSpeech({
    onTranscript: (t) => setTranscript(t),
  });

  const { messages, append, status } = useChat({
    api: "/api/chat",
    onError(err) {
      setBanner(err.message || "Something went wrong");
      setVoiceState("idle");
    },
    onFinish(message) {
      // Speak the assistant's reply, then return to idle.
      setVoiceState("speaking");
      speech.speak(message.content, message.id).finally(() => {
        // `speak` resolves when playback is dispatched; rely on speaking flag
        // (watched below) to flip back to idle when audio actually ends.
      });
    },
  });

  // ── load allocated models ─────────────────────────────────
  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/models");
      if (res.ok) {
        const json = await res.json();
        const list: ChatModel[] = json.models ?? [];
        setModels(list);
        if (list[0]) setSelectedModel(list[0].id);
      }
    })();
  }, []);

  // ── auto-send when the user stops talking ─────────────────
  const wasListeningRef = React.useRef(false);
  React.useEffect(() => {
    if (wasListeningRef.current && !speech.listening) {
      // Recognition ended (a natural pause). Send whatever we captured.
      const text = transcriptRef.current.trim();
      if (text) {
        setVoiceState("thinking");
        setBanner(null);
        const model = selectedModelRef.current;
        if (!model) {
          setBanner("No model allocated. Ask your admin, or use the text chat.");
          setVoiceState("idle");
        } else {
          append({ role: "user", content: text }, { body: { model } });
        }
        setTranscript("");
      } else if (voiceState === "listening") {
        setVoiceState("idle");
      }
    }
    wasListeningRef.current = speech.listening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);

  // When TTS playback finishes, return to idle.
  React.useEffect(() => {
    if (voiceState === "speaking" && !speech.speaking) {
      setVoiceState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.speaking]);

  function startTurn() {
    if (!speech.sttSupported) {
      setBanner("Voice input isn't available in this browser. Try Chrome or Edge.");
      return;
    }
    speech.stopSpeaking();
    setBanner(null);
    setTranscript("");
    setVoiceState("listening");
    speech.startListening();
  }

  function stopTurn() {
    speech.stopListening(); // triggers the auto-send effect above
  }

  const isStreaming = status === "streaming" || status === "submitted";
  const listening = voiceState === "listening";
  // Hue shifts with state for visual feedback: listening (violet), thinking
  // (amber), speaking (cyan-ish), idle (base).
  const hue = listening ? 0 : voiceState === "thinking" ? 40 : voiceState === "speaking" ? 180 : 0;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const stateLabel: Record<VoiceState, string> = {
    idle: "Tap the mic and speak",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-bg-0">
      {/* ambient gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, color-mix(in oklab, var(--accent) 22%, transparent), transparent)",
        }}
      />

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <Link
          href="/chat"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to chat
        </Link>

        <div className="flex items-center gap-2">
          <VoicePicker speech={speech} />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-9 rounded-lg border border-bg-300 bg-bg-100 px-3 text-sm text-text-200 outline-none focus:border-accent"
          >
            {models.length === 0 && <option value="">No models allocated</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* the orb */}
      <div className="relative h-72 w-72 sm:h-96 sm:w-96">
        <VoicePoweredOrb
          enableVoiceControl={listening}
          hue={hue}
          className="rounded-full"
          voiceSensitivity={1.6}
        />
      </div>

      {/* state + last reply */}
      <div className="mt-8 flex min-h-[5rem] max-w-xl flex-col items-center px-6 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-text-300">
          {(voiceState === "thinking" || isStreaming) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span>{stateLabel[voiceState]}</span>
        </div>
        {transcript && (
          <p className="mt-3 text-sm italic text-text-400">“{transcript}”</p>
        )}
        {!transcript && lastAssistant && voiceState !== "listening" && (
          <p className="mt-3 line-clamp-4 text-[15px] leading-relaxed text-text-200">
            {lastAssistant.content}
          </p>
        )}
      </div>

      {banner && (
        <div className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {banner}
        </div>
      )}

      {/* control button */}
      <button
        onClick={listening ? stopTurn : startTurn}
        disabled={isStreaming || voiceState === "speaking"}
        className={`mt-8 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
          listening
            ? "bg-destructive text-white"
            : "bg-accent text-bg-0 hover:bg-accent-hover"
        }`}
        aria-label={listening ? "Stop listening" : "Start speaking"}
      >
        {listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
      </button>

      {speech.speaking && (
        <button
          onClick={() => {
            speech.stopSpeaking();
            setVoiceState("idle");
          }}
          className="mt-3 text-xs text-text-400 underline-offset-2 hover:text-text-200 hover:underline"
        >
          Stop speaking
        </button>
      )}
    </div>
  );
}
