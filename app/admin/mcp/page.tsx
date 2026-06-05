"use client";

import * as React from "react";
import { Plug, Trash2, Plus, Loader2 } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api-client";

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  headersJson: string | null;
  enabled: boolean;
}

export default function McpPage() {
  const [servers, setServers] = React.useState<McpServer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [transport, setTransport] = React.useState("sse");
  const [headersJson, setHeadersJson] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const { servers } = await apiGet<{ servers: McpServer[] }>("/api/admin/mcp");
      setServers(servers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      await apiSend("/api/admin/mcp", "POST", {
        name,
        url,
        transport,
        headersJson: headersJson || undefined,
      });
      setName("");
      setUrl("");
      setHeadersJson("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(s: McpServer) {
    setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await apiSend(`/api/admin/mcp/${s.id}`, "PATCH", { enabled: !s.enabled });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this MCP server?")) return;
    try {
      await apiSend(`/api/admin/mcp/${id}`, "DELETE");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1 className="mb-1 font-serif text-2xl font-light">MCP Servers</h1>
      <p className="mb-6 text-sm text-text-400">
        Register Model Context Protocol servers. Enabled servers&apos; tools become available in chat.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <form
        onSubmit={add}
        className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-bg-300 bg-bg-100 p-4 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-300">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weather tools"
            className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-300">Transport</span>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
          >
            <option value="sse">SSE</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-text-300">Server URL</span>
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/sse"
            className="h-9 rounded-lg border border-bg-300 bg-background px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-text-300">Headers (optional JSON)</span>
          <input
            value={headersJson}
            onChange={(e) => setHeadersJson(e.target.value)}
            placeholder='{"Authorization": "Bearer …"}'
            className="h-9 rounded-lg border border-bg-300 bg-background px-3 font-mono text-xs outline-none focus:border-accent"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add server
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-bg-300 bg-bg-100">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-text-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : servers.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-400">No MCP servers registered.</p>
        ) : (
          <ul className="divide-y divide-bg-300">
            {servers.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-200 text-text-300">
                  <Plug className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-100">{s.name}</p>
                  <p className="truncate font-mono text-xs text-text-400">
                    {s.transport.toUpperCase()} · {s.url}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-300">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => toggle(s)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Enabled
                </label>
                <button
                  onClick={() => remove(s.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete server"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
