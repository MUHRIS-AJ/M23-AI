"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  KeyRound,
  Boxes,
  BarChart3,
  Plug,
  ArrowRight,
  DollarSign,
  Zap,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";

interface UsageRow {
  userId: string;
  email: string;
  name: string | null;
  costCapUsd: number | null;
  capPeriod: string;
  totalCostUsd: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}
interface UsageReport {
  totals: { costUsd: number; requests: number; promptTokens: number; completionTokens: number };
  report: UsageRow[];
}
interface KeyRow {
  id: string;
  label: string;
  provider: string;
  balanceUsd: number | null;
}

// Providers that can report a live balance (matches lib/provider-balance.ts).
const LIVE_BALANCE_PROVIDERS = ["openrouter", "stability"];

export default function AdminDashboard() {
  const [usage, setUsage] = React.useState<UsageReport | null>(null);
  const [counts, setCounts] = React.useState<{ users: number; keys: number; models: number } | null>(
    null
  );
  const [keys, setKeys] = React.useState<KeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncingAll, setSyncingAll] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [users, keyRes, models, u] = await Promise.all([
        apiGet<{ users: unknown[] }>("/api/admin/users"),
        apiGet<{ keys: KeyRow[] }>("/api/admin/keys"),
        apiGet<{ models: unknown[] }>("/api/admin/models"),
        apiGet<UsageReport>("/api/admin/usage"),
      ]);
      setCounts({ users: users.users.length, keys: keyRes.keys.length, models: models.models.length });
      setKeys(keyRes.keys);
      setUsage(u);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function syncBalances() {
    setSyncingAll(true);
    try {
      await apiSend("/api/admin/keys/sync-all", "POST");
      await load();
    } catch {
      // best-effort
    } finally {
      setSyncingAll(false);
    }
  }

  const totals = usage?.totals;
  const topUsers = (usage?.report ?? []).slice(0, 6);
  const maxCost = Math.max(0.0001, ...topUsers.map((u) => u.totalCostUsd));
  const totalTokens = (totals?.promptTokens ?? 0) + (totals?.completionTokens ?? 0);

  // Sum balances across keys that have a known balance.
  const totalBalance = keys.reduce((acc, k) => acc + (k.balanceUsd ?? 0), 0);
  const hasAnyBalance = keys.some((k) => k.balanceUsd !== null);

  const stats = [
    {
      label: "Team members",
      value: counts?.users ?? "—",
      icon: Users,
      href: "/admin/users",
      gradient: "from-violet-500/15 to-fuchsia-500/10",
      ring: "text-violet-500",
    },
    {
      label: "Total spend",
      value: totals ? `$${totals.costUsd.toFixed(4)}` : "—",
      icon: DollarSign,
      href: "/admin/usage",
      gradient: "from-emerald-500/15 to-teal-500/10",
      ring: "text-emerald-500",
    },
    {
      label: "Requests",
      value: totals?.requests ?? "—",
      icon: TrendingUp,
      href: "/admin/usage",
      gradient: "from-sky-500/15 to-cyan-500/10",
      ring: "text-sky-500",
    },
    {
      label: "Tokens used",
      value: totalTokens ? compact(totalTokens) : "—",
      icon: Zap,
      href: "/admin/usage",
      gradient: "from-amber-500/15 to-orange-500/10",
      ring: "text-amber-500",
    },
  ];

  return (
    <div>
      {/* hero */}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-light leading-tight">Admin dashboard</h1>
          <p className="text-sm text-text-400">Your team, keys, models, and spend at a glance.</p>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group relative overflow-hidden rounded-2xl border border-bg-300 bg-gradient-to-br ${s.gradient} p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-bg-100/80 ${s.ring} shadow-sm backdrop-blur`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <ArrowRight className="h-4 w-4 text-text-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="text-2xl font-semibold tabular-nums text-text-100">
                {loading ? "…" : s.value}
              </p>
              <p className="mt-0.5 text-xs font-medium text-text-300">{s.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* usage chart */}
        <div className="rounded-2xl border border-bg-300 bg-bg-100 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-text-400" />
              <h2 className="text-sm font-medium text-text-200">Top spenders</h2>
            </div>
            <Link href="/admin/usage" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>

          {topUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-400">
              {loading ? "Loading…" : "No usage recorded yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {topUsers.map((u) => {
                const pct = Math.round((u.totalCostUsd / maxCost) * 100);
                const capPct =
                  u.costCapUsd && u.costCapUsd > 0
                    ? Math.min(100, Math.round((u.totalCostUsd / u.costCapUsd) * 100))
                    : null;
                return (
                  <div key={u.userId}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-text-200">
                        {u.name || u.email}
                      </span>
                      <span className="tabular-nums text-text-400">
                        ${u.totalCostUsd.toFixed(4)}
                        {capPct !== null && (
                          <span className={capPct >= 90 ? "ml-1 text-destructive" : "ml-1 text-text-500"}>
                            ({capPct}% of cap)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(4, pct)}%`,
                          background: "linear-gradient(90deg, var(--accent), var(--accent-hover))",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* quick links / resources */}
        <div className="space-y-3">
          {[
            { href: "/admin/keys", label: "API keys", icon: KeyRound, hint: `${counts?.keys ?? 0} configured` },
            { href: "/admin/models", label: "Models", icon: Boxes, hint: `${counts?.models ?? 0} in catalog` },
            { href: "/admin/mcp", label: "MCP servers", icon: Plug, hint: "Tool servers" },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.href}
                href={c.href}
                className="group flex items-center gap-3 rounded-2xl border border-bg-300 bg-bg-100 p-4 transition-colors hover:border-text-400"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-200 text-text-300">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-200">{c.label}</p>
                  <p className="text-xs text-text-400">{c.hint}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-text-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* quick start */}
      <div className="mt-4 rounded-2xl border border-bg-300 bg-bg-100 p-5 text-sm text-text-300">
        <p className="font-medium text-text-200">Quick start</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-text-400">
          <li>
            Add an API key under{" "}
            <Link href="/admin/keys" className="text-accent hover:underline">
              API Keys
            </Link>{" "}
            (OpenRouter, OpenAI, Stability, or custom).
          </li>
          <li>
            Sync + enable models under{" "}
            <Link href="/admin/models" className="text-accent hover:underline">
              Models
            </Link>
            .
          </li>
          <li>
            Create members under{" "}
            <Link href="/admin/users" className="text-accent hover:underline">
              Users
            </Link>
            , allocating a key, models, and a budget.
          </li>
        </ol>
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
