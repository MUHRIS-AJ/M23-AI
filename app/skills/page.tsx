"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Trash2, Pencil, Globe, X, Check } from "lucide-react";
import { M23Logo } from "@/components/ui/m23-logo";

interface Skill {
  id: string;
  name: string;
  description: string;
  emoji: string;
  instructions: string;
  webAccess: boolean;
  scope: string;
  enabled: boolean;
  owned: boolean;
}

const EMPTY_DRAFT = {
  name: "",
  emoji: "✨",
  description: "",
  instructions: "",
  webAccess: false,
};

const SYSTEM_SKILL_STARTER =
  "You are M23, an AI assistant. Be accurate, helpful, and honest. If you are unsure, say so plainly, ask for the missing context, or use available tools instead of guessing.";

type Draft = typeof EMPTY_DRAFT;

export default function SkillsPage() {
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/skills");
    if (res.ok) {
      const json = await res.json();
      setSkills(json.skills ?? []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditing("new");
    setError(null);
  }

  function startEdit(s: Skill) {
    setDraft({
      name: s.name,
      emoji: s.emoji,
      description: s.description,
      instructions: s.instructions,
      webAccess: s.webAccess,
    });
    setEditing(s.id);
    setError(null);
  }

  function addSystemStarter() {
    setDraft((current) => ({
      ...current,
      instructions: current.instructions.trim()
        ? `${SYSTEM_SKILL_STARTER}\n\n${current.instructions.trim()}`
        : SYSTEM_SKILL_STARTER,
    }));
  }

  async function save() {
    if (!draft.name.trim() || !draft.instructions.trim()) {
      setError("Name and instructions are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/skills" : `/api/skills/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Save failed");
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this skill?")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleEnabled(s: Skill) {
    await fetch(`/api/skills/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }

  return (
    <div className="aura min-h-dvh bg-background text-text-100">
      <header className="glass glass-sheen sticky top-0 z-20 flex items-center gap-3 px-4 py-3">
        <Link
          href="/chat"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to chat</span>
        </Link>
        <M23Logo size={24} wordmarkClassName="text-sm" />
        <span className="text-sm font-medium text-text-300">· Skills</span>
        <button
          onClick={startNew}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg-0 transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New skill
        </button>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 font-serif text-2xl font-light">Skills</h1>
        <p className="mb-8 text-sm text-text-400">
          Reusable instruction overlays. Activate one in chat with the ✨ button to
          steer M23 for that conversation.
        </p>

        {loading ? (
          <div className="flex justify-center py-12 text-text-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : skills.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-bg-300 py-12 text-center">
            <p className="text-sm text-text-400">No skills yet.</p>
            <button
              onClick={startNew}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              Create your first skill
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {skills.map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  s.enabled ? "border-bg-300" : "border-bg-300/50 opacity-60"
                }`}
              >
                <span className="text-2xl leading-none">{s.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-text-100">{s.name}</h3>
                    {s.scope === "GLOBAL" && (
                      <span className="rounded-full border border-bg-300 px-1.5 py-[1px] text-[10px] font-medium text-text-400">
                        Global
                      </span>
                    )}
                    {s.webAccess && (
                      <Globe className="h-3.5 w-3.5 text-accent" aria-label="Uses web access" />
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-400">{s.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleEnabled(s)}
                    title={s.enabled ? "Disable" : "Enable"}
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                      s.enabled
                        ? "text-accent hover:bg-accent/10"
                        : "text-text-400 hover:bg-bg-200"
                    }`}
                  >
                    {s.enabled ? "On" : "Off"}
                  </button>
                  {s.owned && (
                    <>
                      <button
                        onClick={() => startEdit(s)}
                        className="rounded-lg p-1.5 text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        className="rounded-lg p-1.5 text-text-400 transition-colors hover:bg-bg-200 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="glass max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-bg-300 p-5 sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">
                {editing === "new" ? "New skill" : "Edit skill"}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={addSystemStarter}
                  className="rounded-lg border border-bg-300 px-3 py-1.5 text-xs font-medium text-text-300 hover:bg-bg-200"
                >
                  Use system starter
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg p-1.5 text-text-400 hover:bg-bg-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="mb-1.5 block text-xs font-medium text-text-400">Emoji</label>
                  <input
                    type="text"
                    value={draft.emoji}
                    onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                    maxLength={8}
                    className="w-full rounded-xl border border-bg-300 bg-background px-3 py-2.5 text-center text-lg outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-xs font-medium text-text-400">Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Code reviewer"
                    maxLength={80}
                    className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-400">
                  Description <span className="text-text-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Short summary shown in the list"
                  maxLength={280}
                  className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-400">
                  Instructions
                </label>
                <textarea
                  value={draft.instructions}
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                  placeholder="Write the instructions that should be injected into the chat system prompt. You can start from the built-in system starter and then customize it."
                  rows={6}
                  maxLength={8000}
                  className="custom-scrollbar w-full resize-y rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-accent"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-bg-300 px-3.5 py-3">
                <span className="text-sm">
                  <span className="font-medium">Suggest web access</span>
                  <span className="block text-xs text-text-400">
                    Hint that this skill works best with web search on.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.webAccess}
                  onChange={(e) => setDraft({ ...draft, webAccess: e.target.checked })}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editing === "new" ? "Create skill" : "Save changes"}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-bg-300 px-4 py-2.5 text-sm font-medium text-text-300 hover:bg-bg-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
