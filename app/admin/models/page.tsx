"use client";

import * as React from "react";
import { Boxes, RefreshCw, Loader2, Search, Plus, X, Trash2, Sparkles } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";

interface ModelRow {
  id: string;
  modelId: string;
  displayName: string;
  provider: string;
  tier: string;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
  custom: boolean;
  enabled: boolean;
  _count: { users: number };
}

interface SyncReport {
  provider: string;
  keyLabel: string;
  total: number;
  created: number;
  updated: number;
  error?: string;
}

const TIERS = ["FREE", "ZERO_COST", "PAID"] as const;

const EMPTY_CUSTOM = {
  modelId: "",
  displayName: "",
  provider: "custom",
  tier: "PAID",
  contextLength: "",
  promptPrice: "",
  completionPrice: "",
};

export default function ModelsPage() {
  const [models, setModels] = React.useState<ModelRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [tierFilter, setTierFilter] = React.useState<string>("ALL");
  const [providerFilter, setProviderFilter] = React.useState<string>("ALL");
  const [showCustom, setShowCustom] = React.useState(false);
  const [custom, setCustom] = React.useState(EMPTY_CUSTOM);
  const [savingCustom, setSavingCustom] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const { models } = await apiGet<{ models: ModelRow[] }>("/api/admin/models");
      setModels(models);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await apiSend<{
        total: number;
        created: number;
        updated: number;
        providers: SyncReport[];
      }>("/api/admin/models/sync", "POST", {});
      const lines = res.providers
        .map((p) =>
          p.error
            ? `${p.provider}: failed — ${p.error}`
            : `${p.provider}: ${p.total} models (${p.created} new, ${p.updated} updated)`
        )
        .join(" · ");
      setInfo(`Synced ${res.total} total across ${res.providers.length} provider(s). ${lines}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function patch(id: string, data: Partial<Pick<ModelRow, "tier" | "enabled">>) {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
    try {
      await apiSend(`/api/admin/models/${id}`, "PATCH", data);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  async function deleteModel(id: string) {
    if (!confirm("Delete this model from the catalog?")) return;
    setModels((prev) => prev.filter((m) => m.id !== id));
    try {
      await apiSend(`/api/admin/models/${id}`, "DELETE", {});
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  async function addCustom() {
    if (!custom.modelId.trim()) {
      setError("Model ID is required (e.g. gpt-5.4)");
      return;
    }
    setSavingCustom(true);
    setError(null);
    try {
      await apiSend("/api/admin/models", "POST", {
        modelId: custom.modelId.trim(),
        displayName: custom.displayName.trim() || custom.modelId.trim(),
        provider: custom.provider.trim() || "custom",
        tier: custom.tier,
        contextLength: Number(custom.contextLength) || 0,
        promptPrice: Number(custom.promptPrice) || 0,
        completionPrice: Number(custom.completionPrice) || 0,
      });
      setCustom(EMPTY_CUSTOM);
      setShowCustom(false);
      setInfo(`Added custom model "${custom.modelId.trim()}".`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCustom(false);
    }
  }

  const providers = React.useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models]
  );

  const filtered = models.filter((m) => {
    const matchesQ =
      !q ||
      m.displayName.toLowerCase().includes(q.toLowerCase()) ||
      m.modelId.toLowerCase().includes(q.toLowerCase());
    const matchesTier = tierFilter === "ALL" || m.tier === tierFilter;
    const matchesProvider = providerFilter === "ALL" || m.provider === providerFilter;
    return matchesQ && matchesTier && matchesProvider;
  });

  // Group the filtered models by provider for separated display.
  const grouped = React.useMemo(() => {
    const map = new Map<string, ModelRow[]>();
    for (const m of filtered) {
      const arr = map.get(m.provider) ?? [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-2xl font-light">Models</h1>
          <p className="text-sm text-text-400">
            Sync catalogs from every provider key, set tiers, add custom models, and
            enable models for allocation.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCustom(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-bg-300 px-4 py-2 text-sm font-medium text-text-200 transition-colors hover:bg-bg-200"
          >
            <Plus className="h-4 w-4" />
            Add custom
          </button>
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync all providers
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {info && (
        <div className="mb-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{info}</div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            className="h-9 w-full rounded-lg border border-bg-300 bg-background pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
        >
          <option value="ALL">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
        >
          <option value="ALL">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bg-300 py-10 text-text-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-bg-300 py-10 text-center text-sm text-text-400">
          {models.length === 0
            ? "No models yet. Add a provider key, then click “Sync all providers”."
            : "No models match your filter."}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([prov, rows]) => (
            <div key={prov} className="overflow-hidden rounded-2xl border border-bg-300 bg-bg-100">
              <div className="flex items-center justify-between border-b border-bg-300 bg-bg-200/40 px-4 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold capitalize text-text-200">
                  {prov}
                  <span className="rounded-full bg-bg-300 px-2 py-0.5 text-[11px] font-normal text-text-400">
                    {rows.length}
                  </span>
                </h2>
                <span className="text-[11px] text-text-400">
                  {rows.filter((r) => r.enabled).length} enabled
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                <ul className="divide-y divide-bg-300">
                  {rows.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-200 text-text-300">
                        {m.custom ? <Sparkles className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium text-text-100">
                          {m.displayName}
                          {m.custom && (
                            <span className="rounded-full border border-bg-300 px-1.5 py-[1px] text-[10px] font-normal text-text-400">
                              custom
                            </span>
                          )}
                        </p>
                        <p className="truncate font-mono text-xs text-text-400">{m.modelId}</p>
                      </div>
                      <select
                        value={m.tier}
                        onChange={(e) => patch(m.id, { tier: e.target.value })}
                        className="h-8 rounded-lg border border-bg-300 bg-background px-2 text-xs outline-none focus:border-accent"
                      >
                        {TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-300">
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) => patch(m.id, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        Enabled
                      </label>
                      {m.custom && (
                        <button
                          onClick={() => deleteModel(m.id)}
                          className="rounded-lg p-1.5 text-text-400 transition-colors hover:bg-bg-200 hover:text-destructive"
                          aria-label="Delete custom model"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom model modal */}
      {showCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-md rounded-3xl border border-bg-300 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">Add custom model</h2>
              <button onClick={() => setShowCustom(false)} className="rounded-lg p-1.5 text-text-400 hover:bg-bg-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Model ID" hint="The exact id the provider expects, e.g. gpt-5.4">
                <input
                  value={custom.modelId}
                  onChange={(e) => setCustom({ ...custom, modelId: e.target.value })}
                  placeholder="gpt-5.4"
                  className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Display name">
                  <input
                    value={custom.displayName}
                    onChange={(e) => setCustom({ ...custom, displayName: e.target.value })}
                    placeholder="GPT-5.4"
                    className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field label="Provider" hint="Match an API key's provider">
                  <input
                    value={custom.provider}
                    onChange={(e) => setCustom({ ...custom, provider: e.target.value })}
                    placeholder="openai"
                    className="w-full rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Tier">
                  <select
                    value={custom.tier}
                    onChange={(e) => setCustom({ ...custom, tier: e.target.value })}
                    className="w-full rounded-xl border border-bg-300 bg-background px-2 py-2.5 text-sm outline-none focus:border-accent"
                  >
                    {TIERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Context">
                  <input
                    value={custom.contextLength}
                    onChange={(e) => setCustom({ ...custom, contextLength: e.target.value })}
                    placeholder="128000"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-bg-300 bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field label="$/Mtok in" hint="">
                  <input
                    value={custom.promptPrice}
                    onChange={(e) => setCustom({ ...custom, promptPrice: e.target.value })}
                    placeholder="0"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-bg-300 bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-text-500">
                Prices are USD per token (not per million). Leave 0 if unknown.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addCustom}
                  disabled={savingCustom}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add model
                </button>
                <button
                  onClick={() => setShowCustom(false)}
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-text-400">
        {label}
        {hint ? <span className="ml-1 text-text-500">· {hint}</span> : null}
      </label>
      {children}
    </div>
  );
}
