"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";

interface ReportRow {
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

interface UsageData {
  report: ReportRow[];
  totals: { costUsd: number; promptTokens: number; completionTokens: number; requests: number };
}

export default function UsagePage() {
  const [data, setData] = React.useState<UsageData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setData(await apiGet<UsageData>("/api/admin/usage"));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="mb-1 font-serif text-2xl font-light">Usage</h1>
      <p className="mb-6 text-sm text-text-400">
        Token consumption and estimated cost per team member.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-text-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total cost" value={`$${data.totals.costUsd.toFixed(4)}`} />
            <Stat label="Requests" value={data.totals.requests.toLocaleString()} />
            <Stat label="Prompt tokens" value={data.totals.promptTokens.toLocaleString()} />
            <Stat label="Completion tokens" value={data.totals.completionTokens.toLocaleString()} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-bg-300 bg-bg-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bg-300 text-left text-xs uppercase tracking-wide text-text-400">
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Requests</th>
                  <th className="px-4 py-2.5 font-medium">Tokens (in / out)</th>
                  <th className="px-4 py-2.5 font-medium">Cost</th>
                  <th className="px-4 py-2.5 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-300">
                {data.report.map((r) => {
                  const pct =
                    r.costCapUsd && r.costCapUsd > 0
                      ? Math.min(100, (r.totalCostUsd / r.costCapUsd) * 100)
                      : null;
                  return (
                    <tr key={r.userId}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-text-100">{r.name || r.email}</p>
                        <p className="text-xs text-text-400">{r.email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-text-300">{r.requests}</td>
                      <td className="px-4 py-2.5 text-text-300">
                        {r.promptTokens.toLocaleString()} / {r.completionTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-text-100">
                        ${r.totalCostUsd.toFixed(4)}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.costCapUsd === null ? (
                          <span className="text-xs text-text-400">Unlimited</span>
                        ) : (
                          <div className="w-28">
                            <div className="mb-1 text-xs text-text-400">
                              ${r.totalCostUsd.toFixed(3)} / ${r.costCapUsd.toFixed(2)}
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-bg-300">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  background: pct! >= 100 ? "var(--color-destructive)" : "var(--accent)",
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-bg-300 bg-bg-100 p-4">
      <p className="text-xs text-text-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-100">{value}</p>
    </div>
  );
}
