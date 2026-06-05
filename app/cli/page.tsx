"use client";

import * as React from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { ArrowLeft, Clipboard, Download, Play, RotateCcw, TerminalSquare, Wand2 } from "lucide-react";
import { M23Logo } from "@/components/ui/m23-logo";
import { translateCliCommand, type CliTranslation } from "@/lib/cli";
import { AUTO_MODEL_ID } from "@/lib/auto-model";

interface ChatModel {
  id: string;
  name: string;
}

interface HistoryItem {
  id: string;
  input: string;
  results: CliTranslation[];
  timestamp: number;
}

const SAMPLE_COMMAND = "ls -la";

export default function CliPage() {
  const [input, setInput] = React.useState(SAMPLE_COMMAND);
  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [history, setHistory] = React.useState<HistoryItem[]>(() => {
    const initial = translateCliCommand(SAMPLE_COMMAND);
    return [{ id: crypto.randomUUID(), input: SAMPLE_COMMAND, results: initial, timestamp: Date.now() }];
  });
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<string | null>(null);

  const selectedModelRef = React.useRef("");
  selectedModelRef.current = selectedModel;

  const { messages, append, status, error } = useChat({
    api: "/api/chat",
    onError(err) {
      setBanner(err.message || "An error occurred.");
    },
  });

  const latest = history[0];
  const latestAssistant = React.useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages]
  );

  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/models");
      if (!res.ok) return;
      const json = await res.json();
      const list: ChatModel[] = json.models ?? [];
      setModels(list);
      const preferred = list.find((m) => m.id === AUTO_MODEL_ID)?.id ?? list[0]?.id ?? "";
      setSelectedModel(preferred);
    })();
  }, []);

  async function runCommand(nextInput?: string) {
    const command = (nextInput ?? input).trim();
    if (!command) return;
    const results = translateCliCommand(command);
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      input: command,
      results,
      timestamp: Date.now(),
    };
    setHistory((prev) => [item, ...prev].slice(0, 30));
    setInput("");
    setBanner(null);

    if (!selectedModelRef.current) {
      setBanner("No AI model is allocated to your account yet.");
      return;
    }

    await append(
      {
        role: "user",
        content:
          `Act as a terminal expert. Explain what this command does, point out any risks, ` +
          `and show the equivalent command for Windows PowerShell, macOS, Linux, and Android Termux when useful. ` +
          `Command: ${command}`,
      },
      {
        body: {
          model: selectedModelRef.current,
          temporary: true,
        },
      }
    );
  }

  function clearHistory() {
    setHistory([]);
  }

  function copyCommand(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1200);
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_40%,#0b1020_100%)] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/chat" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <M23Logo size={24} wordmarkClassName="text-sm text-white" />
          <span className="text-sm text-white/60">· CLI Panel</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-white/50">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">Windows</span>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-200">macOS</span>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-200">Linux</span>
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-200">Android</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="font-mono text-xl font-semibold tracking-wide">Command Translator</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/60">
                Type one command and get an AI explanation plus translated equivalents for Windows PowerShell,
                macOS, Linux, and Android Termux.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/80 outline-none"
              >
                <option value="">No model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                onClick={clearHistory}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-[#07130f] p-3 font-mono text-sm text-emerald-200 shadow-inner shadow-black/30">
            <div className="mb-3 flex items-center gap-2 text-emerald-300/80">
              <TerminalSquare className="h-4 w-4" />
              <span>m23-cli</span>
              <span className="text-white/30">|</span>
              <span>{status === "streaming" || status === "submitted" ? "thinking…" : latest ? `${latest.results.length} translations ready` : "waiting"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">$</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runCommand();
                  }
                }}
                placeholder="Try: ls -la, mkdir projects, curl https://example.com"
                className="w-full bg-transparent text-emerald-100 outline-none placeholder:text-emerald-700"
              />
              <button
                onClick={() => void runCommand()}
                disabled={status === "streaming" || status === "submitted"}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                Run
              </button>
            </div>
          </div>

          {(banner || error) && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {banner || error?.message || "An error occurred."}
            </div>
          )}

          {latestAssistant && (
            <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                <Wand2 className="h-4 w-4" />
                AI response
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-cyan-50">
                {latestAssistant.content}
              </pre>
            </div>
          )}

          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/50">
                No commands yet.
              </div>
            ) : (
              history.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="font-mono text-sm text-white/90">$ {item.input}</div>
                    <button
                      onClick={() => copyCommand(item.input, item.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                      {copiedId === item.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {item.results.map((result) => (
                      <div key={`${item.id}-${result.platform}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">{result.label}</p>
                            {result.note && <p className="text-xs text-white/50">{result.note}</p>}
                          </div>
                          <button
                            onClick={() => copyCommand(result.command, `${item.id}-${result.platform}`)}
                            className="rounded-lg border border-white/10 p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label={`Copy ${result.label} command`}
                          >
                            {copiedId === `${item.id}-${result.platform}` ? <Download className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-emerald-100">
                          {result.command}
                        </pre>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div>
            <h2 className="font-mono text-lg font-semibold">Quick examples</h2>
            <p className="mt-1 text-sm text-white/60">
              Use these to test cross-platform equivalents.
            </p>
          </div>

          <div className="space-y-2">
            {[
              "pwd",
              "ls -la",
              "mkdir app-folder",
              "touch README.md",
              "rm old-files",
              "curl https://example.com",
              "grep TODO src/index.ts",
              "git status",
              "pkg install nodejs",
            ].map((sample) => (
              <button
                key={sample}
                onClick={() => runCommand(sample)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="font-mono">{sample}</span>
                <Wand2 className="h-4 w-4 text-white/40" />
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
            Android support is treated as Termux style commands. Bash-compatible commands are shown by default, and package installs are left as-is when they already match Android tooling.
          </div>
        </aside>
      </main>
    </div>
  );
}
