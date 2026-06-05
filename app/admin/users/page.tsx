"use client";

import * as React from "react";
import { Users as UsersIcon, Trash2, Plus, Loader2, Pencil, X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  costCapUsd: number | null;
  capPeriod: string;
  _count: { apiKeys: number; models: number };
}

interface KeyOpt { id: string; label: string }
interface ModelOpt { id: string; modelId: string; displayName: string; tier: string; enabled: boolean }

function isFreeModel(model: ModelOpt) {
  return model.tier === "FREE" || model.tier === "ZERO_COST";
}

export default function UsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [keys, setKeys] = React.useState<KeyOpt[]>([]);
  const [models, setModels] = React.useState<ModelOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [u, k, m] = await Promise.all([
        apiGet<{ users: UserRow[] }>("/api/admin/users"),
        apiGet<{ keys: KeyOpt[] }>("/api/admin/keys"),
        apiGet<{ models: ModelOpt[] }>("/api/admin/models"),
      ]);
      setUsers(u.users);
      setKeys(k.keys);
      setModels(m.models.filter((x) => x.enabled));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this user and all their data?")) return;
    try {
      await apiSend(`/api/admin/users/${id}`, "DELETE");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openNew() {
    setEditingId(null);
    setEditorOpen(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setEditorOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-2xl font-light">Team members</h1>
          <p className="text-sm text-text-400">
            Create accounts and allocate API keys, models, and budgets.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          New member
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-bg-300 bg-bg-100">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-400">No users yet.</p>
        ) : (
          <ul className="divide-y divide-bg-300">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-200 text-text-300">
                  <UsersIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-text-100">
                    {u.name || u.email}
                    <span className="rounded-full bg-bg-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-400">
                      {u.role}
                    </span>
                  </p>
                  <p className="truncate text-xs text-text-400">
                    {u.email} · {u._count.models} models · {u._count.apiKeys} keys ·{" "}
                    {u.costCapUsd === null ? "no cap" : `$${u.costCapUsd}/${u.capPeriod.toLowerCase()}`}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(u.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
                  aria-label="Edit user"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(u.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete user"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editorOpen && (
        <UserEditor
          userId={editingId}
          keys={keys}
          models={models}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── User create/edit modal ──────────────────────────────────
function UserEditor({
  userId,
  keys,
  models,
  onClose,
  onSaved,
}: {
  userId: string | null;
  keys: KeyOpt[];
  models: ModelOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!userId;
  const [loading, setLoading] = React.useState(isEdit);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState("MEMBER");
  const [capEnabled, setCapEnabled] = React.useState(false);
  const [costCap, setCostCap] = React.useState("5");
  const [capPeriod, setCapPeriod] = React.useState("MONTHLY");
  const [keyIds, setKeyIds] = React.useState<Set<string>>(new Set());
  const [modelIds, setModelIds] = React.useState<Set<string>>(new Set());
  const [modelQuery, setModelQuery] = React.useState("");

  const availableModels = isEdit ? models : models.filter(isFreeModel);

  React.useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { user } = await apiGet<{
          user: {
            email: string;
            name: string | null;
            role: string;
            costCapUsd: number | null;
            capPeriod: string;
            apiKeyIds: string[];
            modelIds: string[];
          };
        }>(`/api/admin/users/${userId}`);
        setEmail(user.email);
        setName(user.name ?? "");
        setRole(user.role);
        setCapEnabled(user.costCapUsd !== null);
        if (user.costCapUsd !== null) setCostCap(String(user.costCapUsd));
        setCapPeriod(user.capPeriod);
        setKeyIds(new Set(user.apiKeyIds));
        setModelIds(new Set(user.modelIds));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  React.useEffect(() => {
    if (isEdit) return;
    setModelIds(new Set(models.filter(isFreeModel).map((model) => model.id)));
  }, [models, isEdit]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: name || undefined,
      role,
      costCapUsd: capEnabled ? parseFloat(costCap) || 0 : null,
      capPeriod,
      apiKeyIds: Array.from(keyIds),
      modelIds: Array.from(modelIds),
    };
    try {
      if (isEdit) {
        await apiSend(`/api/admin/users/${userId}`, "PATCH", {
          ...payload,
          ...(password ? { password } : {}),
        });
      } else {
        await apiSend("/api/admin/users", "POST", { ...payload, email, password });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filteredModels = availableModels.filter(
    (m) =>
      !modelQuery ||
      m.displayName.toLowerCase().includes(modelQuery.toLowerCase()) ||
      m.modelId.toLowerCase().includes(modelQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-bg-300 bg-bg-100 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-medium">{isEdit ? "Edit member" : "New member"}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-200" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-300">Email</span>
                <input
                  required
                  type="email"
                  value={email}
                  disabled={isEdit}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-300">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-300">{isEdit ? "New password (optional)" : "Password"}</span>
                <input
                  type="password"
                  required={!isEdit}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? "Leave blank to keep" : "min 6 chars"}
                  className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-300">Role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
            </div>

            {/* Budget cap */}
            <div className="rounded-lg border border-bg-300 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={capEnabled}
                  onChange={(e) => setCapEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="font-medium text-text-200">Set a budget cap</span>
              </label>
              {capEnabled && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-text-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={costCap}
                      onChange={(e) => setCostCap(e.target.value)}
                      className="h-9 w-28 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <select
                    value={capPeriod}
                    onChange={(e) => setCapPeriod(e.target.value)}
                    className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
                  >
                    <option value="MONTHLY">per month</option>
                    <option value="TOTAL">total</option>
                  </select>
                </div>
              )}
            </div>

            {/* API key allocation */}
            <div>
              <p className="mb-2 text-sm font-medium text-text-200">API keys</p>
              {keys.length === 0 ? (
                <p className="text-xs text-text-400">No API keys yet — add one first.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {keys.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggle(keyIds, k.id, setKeyIds)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        keyIds.has(k.id)
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-bg-300 text-text-300 hover:bg-bg-200"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model allocation */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-text-200">
                  Models ({modelIds.size} selected)
                </p>
                <input
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                  placeholder="Filter…"
                  className="h-7 w-32 rounded-lg border border-bg-300 bg-background px-2 text-xs outline-none focus:border-accent"
                />
              </div>
              {availableModels.length === 0 ? (
                <p className="text-xs text-text-400">
                  {isEdit
                    ? "No enabled models — sync + enable some first."
                    : "No free enabled models — sync + enable some free models first."}
                </p>
              ) : (
                <div className="custom-scrollbar max-h-44 space-y-1 overflow-y-auto rounded-lg border border-bg-300 p-2">
                  {filteredModels.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-bg-200"
                    >
                      <input
                        type="checkbox"
                        checked={modelIds.has(m.id)}
                        onChange={() => toggle(modelIds, m.id, setModelIds)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="flex-1 truncate text-text-200">{m.displayName}</span>
                      <span className="rounded bg-bg-200 px-1.5 py-0.5 text-[10px] text-text-400">
                        {m.tier}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-bg-300 px-4 py-2 text-sm text-text-300 transition-colors hover:bg-bg-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? "Save changes" : "Create member"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
