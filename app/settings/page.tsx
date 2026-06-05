"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { M23Logo } from "@/components/ui/m23-logo";

interface Preset {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

interface Settings {
  preferredName: string | null;
  personality: string | null;
  personaPreset: string | null;
  responseStyle: string | null;
  defaultModelId: string | null;
  alwaysWebSearch: boolean;
}

interface ModelOption {
  id: string;
  name: string;
}

const STYLES = [
  { id: "concise", label: "Concise", hint: "Short, to the point" },
  { id: "balanced", label: "Balanced", hint: "Thorough but not padded" },
  { id: "detailed", label: "Detailed", hint: "Deep, with examples" },
];

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const [sRes, mRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/models"),
      ]);
      if (sRes.ok) {
        const json = await sRes.json();
        setSettings(
          json.settings ?? {
            preferredName: null,
            personality: null,
            personaPreset: null,
            responseStyle: null,
            defaultModelId: null,
            alwaysWebSearch: false,
          }
        );
        setPresets(json.presets ?? []);
      }
      if (mRes.ok) {
        const json = await mRes.json();
        setModels((json.models ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
      }
    })();
  }, []);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-text-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="aura min-h-dvh bg-background text-text-100">
      {/* header */}
      <header className="glass glass-sheen sticky top-0 z-20 flex items-center gap-3 px-4 py-3">
        <Link
          href="/chat"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to chat</span>
        </Link>
        <M23Logo size={24} wordmarkClassName="text-sm" />
        <span className="text-sm font-medium text-text-300">· Settings</span>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 font-serif text-2xl font-light">Personalization</h1>
        <p className="mb-8 text-sm text-text-400">
          Shape how M23 talks to you. These apply to every new message.
        </p>

        {/* Preferred name */}
        <Section title="What should M23 call you?">
          <input
            type="text"
            value={settings.preferredName ?? ""}
            onChange={(e) => patch("preferredName", e.target.value)}
            placeholder="e.g. Alex"
            maxLength={80}
            className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          />
        </Section>

        {/* Persona preset */}
        <Section title="Personality preset" hint="A starting style. Stacks with your custom instructions below.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <PresetCard
              active={!settings.personaPreset || settings.personaPreset === "custom"}
              emoji="🧩"
              name="Custom only"
              onClick={() => patch("personaPreset", "custom")}
            />
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                active={settings.personaPreset === p.id}
                emoji={p.emoji}
                name={p.name}
                title={p.description}
                onClick={() => patch("personaPreset", p.id)}
              />
            ))}
          </div>
        </Section>

        {/* Response style */}
        <Section title="Response length">
          <div className="flex gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  patch("responseStyle", settings.responseStyle === s.id ? null : s.id)
                }
                title={s.hint}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  settings.responseStyle === s.id
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-bg-300 text-text-300 hover:bg-bg-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Custom personality */}
        <Section
          title="Custom instructions"
          hint="Free-form. Tell M23 about yourself, your preferences, tone, format — anything."
        >
          <textarea
            value={settings.personality ?? ""}
            onChange={(e) => patch("personality", e.target.value)}
            placeholder="e.g. I'm a backend engineer. Prefer TypeScript. Always show runnable code. Skip the pep talk."
            rows={5}
            maxLength={4000}
            className="custom-scrollbar w-full resize-y rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-accent"
          />
          <p className="mt-1 text-right text-[11px] text-text-500">
            {(settings.personality ?? "").length} / 4000
          </p>
        </Section>

        {/* Defaults */}
        <Section title="Chat defaults">
          <label className="mb-3 block text-xs font-medium text-text-400">
            Default model
          </label>
          <select
            value={settings.defaultModelId ?? ""}
            onChange={(e) => patch("defaultModelId", e.target.value || null)}
            className="mb-4 w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          >
            <option value="">First available (automatic)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-bg-300 px-3.5 py-3">
            <span className="text-sm">
              <span className="font-medium">Always search the web</span>
              <span className="block text-xs text-text-400">
                Start every chat with web access + citations on.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.alwaysWebSearch}
              onChange={(e) => patch("alwaysWebSearch", e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          </label>
        </Section>

        {/* Save bar */}
        <div className="sticky bottom-4 mt-8 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {saved ? "Saved" : "Save changes"}
          </button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <h2 className="mb-1 text-sm font-semibold text-text-200">{title}</h2>
      {hint && <p className="mb-2.5 text-xs text-text-400">{hint}</p>}
      {!hint && <div className="mb-2.5" />}
      {children}
    </div>
  );
}

function PresetCard({
  active,
  emoji,
  name,
  title,
  onClick,
}: {
  active: boolean;
  emoji: string;
  name: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-accent/50 bg-accent/10"
          : "border-bg-300 hover:bg-bg-200"
      }`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className={`text-xs font-medium ${active ? "text-accent" : "text-text-200"}`}>
        {name}
      </span>
    </button>
  );
}
