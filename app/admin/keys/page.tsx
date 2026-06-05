"use client";

import * as React from "react";
import { KeyRound, Trash2, Plus, Loader2, Pencil, Calendar, DollarSign, Zap, RefreshCw } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";

interface ApiKeyRow {
  id: string;
  label: string;
  provider: string;
  baseUrl: string | null;
  creditUsd: number | null;
  balanceUsd: number | null;
  expiresAt: string | null;
  costPerReq: number | null;
  assignmentTier: string | null;
  autoAssign: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { users: number };
}

export default function KeysPage() {
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [syncNote, setSyncNote] = React.useState<string | null>(null);

  // Form state
  const [label, setLabel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [provider, setProvider] = React.useState("openrouter");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [creditUsd, setCreditUsd] = React.useState("");
  const [balanceUsd, setBalanceUsd] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [costPerReq, setCostPerReq] = React.useState("");
  const [assignmentTier, setAssignmentTier] = React.useState("");
  const [autoAssign, setAutoAssign] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const { keys } = await apiGet<{ keys: ApiKeyRow[] }>("/api/admin/keys");
      setKeys(keys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setLabel("");
    setKey("");
    setProvider("openrouter");
    setBaseUrl("");
    setCreditUsd("");
    setBalanceUsd("");
    setExpiresAt("");
    setCostPerReq("");
    setAssignmentTier("");
    setAutoAssign(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAdding(true);

    try {
      const payload: any = {
        label,
        provider,
        baseUrl: baseUrl || undefined,
        autoAssign,
      };

      // Only include key for new API keys
      if (!editingId) {
        if (!key) throw new Error("API key is required");
        payload.key = key;
      }

      if (creditUsd) payload.creditUsd = parseFloat(creditUsd);
      if (balanceUsd) payload.balanceUsd = parseFloat(balanceUsd);
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      if (costPerReq) payload.costPerReq = parseFloat(costPerReq);
      if (assignmentTier) payload.assignmentTier = assignmentTier;

      if (editingId) {
        // Update existing key
        await apiSend(`/api/admin/keys/${editingId}`, "PATCH", payload);
      } else {
        // Create new key
        await apiSend("/api/admin/keys", "POST", payload);
      }

      resetForm();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(keyData: ApiKeyRow) {
    setEditingId(keyData.id);
    setLabel(keyData.label);
    setProvider(keyData.provider);
    setBaseUrl(keyData.baseUrl || "");
    setCreditUsd(keyData.creditUsd?.toString() || "");
    setBalanceUsd(keyData.balanceUsd?.toString() || "");
    setExpiresAt(keyData.expiresAt ? new Date(keyData.expiresAt).toISOString().split("T")[0] : "");
    setCostPerReq(keyData.costPerReq?.toString() || "");
    setAssignmentTier(keyData.assignmentTier || "");
    setAutoAssign(keyData.autoAssign);
  }

  async function removeKey(id: string) {
    if (!confirm("Delete this API key? Users allocated to it will lose access.")) return;
    try {
      await apiSend(`/api/admin/keys/${id}`, "DELETE");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Refresh a single key's balance from the provider's live API.
  async function syncBalance(id: string) {
    setSyncNote(null);
    setSyncing((prev) => new Set(prev).add(id));
    try {
      const res = await apiSend<{
        supported: boolean;
        balanceUsd: number | null;
        updated: boolean;
        note?: string;
      }>(`/api/admin/keys/${id}/sync-balance`, "POST");
      if (res.updated) {
        setSyncNote(`Balance updated: $${(res.balanceUsd ?? 0).toFixed(4)}`);
        await load();
      } else {
        setSyncNote(res.note ?? "This provider has no live balance API.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Refresh every key that supports a live balance lookup.
  async function syncAll() {
    setSyncNote(null);
    setSyncingAll(true);
    try {
      const res = await apiSend<{ updated: number; total: number }>(
        "/api/admin/keys/sync-all",
        "POST"
      );
      setSyncNote(`Synced ${res.updated} of ${res.total} key${res.total === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingAll(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatUsd(value: number | null) {
    if (value === null || value === undefined) return "—";
    return `$${value.toFixed(4)}`;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-2xl font-light">API Keys</h1>
          <p className="text-sm text-text-400">
            Manage provider credentials, balance, and automatic assignment to users.
          </p>
        </div>
        <button
          onClick={syncAll}
          disabled={syncingAll || keys.length === 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-bg-300 px-3 py-2 text-sm font-medium text-text-200 transition-colors hover:bg-bg-200 disabled:opacity-50"
          title="Fetch live balances from OpenRouter & Stability"
        >
          <RefreshCw className={`h-4 w-4 ${syncingAll ? "animate-spin" : ""}`} />
          Sync balances
        </button>
      </div>

      {syncNote && (
        <div className="mb-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {syncNote}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-4 rounded-2xl border border-bg-300 bg-bg-100 p-4"
      >
        <div className="mb-3">
          <h2 className="text-sm font-medium text-text-200">
            {editingId ? "Edit API Key" : "Add New API Key"}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-300">Label *</span>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main OpenRouter"
              className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-300">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="stability">Stability AI (image)</option>
              <option value="custom">Custom (OpenAI-compatible)</option>
            </select>
          </label>

          {!editingId && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-text-300">API Key *</span>
              <input
                required
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-text-300">Base URL (optional)</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="border-t border-bg-300 pt-3">
          <h3 className="mb-3 text-xs font-medium text-text-300">Provider Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-300">Total Credit (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={creditUsd}
                onChange={(e) => setCreditUsd(e.target.value)}
                placeholder="e.g. 100.00"
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-300">Current Balance (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={balanceUsd}
                onChange={(e) => setBalanceUsd(e.target.value)}
                placeholder="e.g. 50.00"
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-300">Cost Per Request (USD)</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={costPerReq}
                onChange={(e) => setCostPerReq(e.target.value)}
                placeholder="e.g. 0.01"
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-300">Expiration Date</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-bg-300 pt-3">
          <h3 className="mb-3 text-xs font-medium text-text-300">Auto-Assignment</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-300">Assignment Tier</span>
              <select
                value={assignmentTier}
                onChange={(e) => setAssignmentTier(e.target.value)}
                className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">None (Manual only)</option>
                <option value="FREE">FREE</option>
                <option value="STANDARD">STANDARD</option>
                <option value="PREMIUM">PREMIUM</option>
              </select>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="h-4 w-4 rounded border border-bg-300"
              />
              <span className="text-sm text-text-300">Enable auto-assignment</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Update Key" : "Add Key"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-bg-300 px-4 py-2 text-sm font-medium text-text-300 transition-colors hover:bg-bg-200"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-bg-300 bg-bg-100">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-400">No API keys yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-bg-300 bg-bg-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-text-300">Label</th>
                <th className="px-4 py-3 text-left font-medium text-text-300">Provider</th>
                <th className="px-4 py-3 text-right font-medium text-text-300">Balance</th>
                <th className="px-4 py-3 text-right font-medium text-text-300">Credit</th>
                <th className="px-4 py-3 text-right font-medium text-text-300">Cost/Req</th>
                <th className="px-4 py-3 text-center font-medium text-text-300">Expires</th>
                <th className="px-4 py-3 text-center font-medium text-text-300">Tier</th>
                <th className="px-4 py-3 text-center font-medium text-text-300">Users</th>
                <th className="px-4 py-3 text-center font-medium text-text-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-300">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-bg-200">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-text-100">{k.label}</p>
                      {k.baseUrl && (
                        <p className="truncate text-xs text-text-400">{k.baseUrl}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-300">{k.provider}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-text-400" />
                      <span>{formatUsd(k.balanceUsd)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Zap className="h-3.5 w-3.5 text-text-400" />
                      <span>{formatUsd(k.creditUsd)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{formatUsd(k.costPerReq)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-text-400" />
                      <span className="text-xs">{formatDate(k.expiresAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {k.autoAssign && k.assignmentTier ? (
                      <span className="inline-block rounded-full bg-accent/20 px-2 py-1 text-xs font-medium text-accent">
                        {k.assignmentTier}
                      </span>
                    ) : (
                      <span className="text-xs text-text-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-text-100">{k._count.users}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => syncBalance(k.id)}
                        disabled={syncing.has(k.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-accent disabled:opacity-50"
                        aria-label="Refresh balance"
                        title="Fetch live balance"
                      >
                        <RefreshCw className={`h-4 w-4 ${syncing.has(k.id) ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => startEdit(k)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-accent"
                        aria-label="Edit key"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeKey(k.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
