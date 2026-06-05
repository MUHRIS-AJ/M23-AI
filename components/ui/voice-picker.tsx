"use client";

// Voice settings popover: pick a TTS voice (browser voices + cloud voices when
// an OpenAI key is allocated), adjust speaking rate, test it, and toggle whether
// assistant replies are read aloud automatically. Driven entirely by the shared
// useSpeech hook so the chat room and the /voice page stay in sync.

import * as React from "react";
import { Volume2, Search, Check, Play, Square, X } from "lucide-react";
import type { UseSpeech } from "@/lib/speech";

interface VoicePickerProps {
  speech: UseSpeech;
  /** Show the "Read replies aloud" toggle (chat room). The /voice page omits it. */
  showAutoSpeak?: boolean;
  className?: string;
}

const TEST_LINE = "Hi! This is how I'll sound when I read replies to you.";

export function VoicePicker({ speech, showAutoSpeak = false, className }: VoicePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { voices, selectedVoiceId, setVoice, rate, setRate, speaking, speak, stopSpeaking } =
    speech;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter((v) => v.label.toLowerCase().includes(q));
  }, [voices, query]);

  const browser = filtered.filter((v) => v.kind === "browser");
  const cloud = filtered.filter((v) => v.kind === "cloud");
  const current = voices.find((v) => v.id === selectedVoiceId);
  const disabled = !speech.ttsSupported;

  function testVoice() {
    if (speaking) stopSpeaking();
    else void speak(TEST_LINE, "voice-test");
  }

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          open
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-bg-300 text-text-300 hover:bg-bg-200 hover:text-text-100"
        }`}
        aria-label="Voice settings"
        aria-expanded={open}
        title={disabled ? "Text-to-speech unavailable in this browser" : "Voice settings"}
      >
        <Volume2 className="h-4 w-4" />
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {current ? current.label.replace(/\s*\([^)]*\)\s*$/, "") : "Voice"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[300px] origin-top-right animate-fade-in rounded-2xl border border-bg-300 bg-bg-100 p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-xs font-semibold text-text-200">Voice</span>
            <button
              onClick={() => setOpen(false)}
              className="text-text-400 hover:text-text-200"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* search (only when the list is long) */}
          {voices.length > 6 && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-bg-300 bg-background px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-text-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search voices…"
                className="h-8 w-full bg-transparent text-xs text-text-100 outline-none placeholder:text-text-400"
              />
            </div>
          )}

          {/* voice list */}
          <div className="custom-scrollbar max-h-[220px] overflow-y-auto pr-0.5">
            {voices.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-text-400">
                No voices available in this browser.
              </p>
            )}

            {cloud.length > 0 && (
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-400">
                Cloud (high quality)
              </p>
            )}
            {cloud.map((v) => (
              <VoiceRow
                key={v.id}
                label={v.label}
                selected={v.id === selectedVoiceId}
                onClick={() => setVoice(v.id)}
              />
            ))}

            {browser.length > 0 && (
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-400">
                Browser
              </p>
            )}
            {browser.map((v) => (
              <VoiceRow
                key={v.id}
                label={v.label}
                selected={v.id === selectedVoiceId}
                onClick={() => setVoice(v.id)}
              />
            ))}
          </div>

          {/* rate slider */}
          <div className="mt-2 border-t border-bg-300 px-2 pt-2.5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-400">
              <span>Speed</span>
              <span className="tabular-nums text-text-300">{rate.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-300 accent-[var(--accent)]"
              aria-label="Speaking speed"
            />
          </div>

          {/* test + auto-speak */}
          <div className="mt-2.5 flex items-center gap-2 px-1">
            <button
              onClick={testVoice}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-40"
              type="button"
            >
              {speaking ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {speaking ? "Stop" : "Test"}
            </button>

            {showAutoSpeak && (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-text-300">
                <span>Read replies aloud</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={speech.autoSpeak}
                  onClick={() => speech.setAutoSpeak(!speech.autoSpeak)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    speech.autoSpeak ? "bg-accent" : "bg-bg-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      speech.autoSpeak ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors hover:bg-bg-200 ${
        selected ? "text-text-100" : "text-text-300"
      }`}
      type="button"
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-accent" />}
    </button>
  );
}

export default VoicePicker;
