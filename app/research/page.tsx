"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Telescope, Loader2, Search, CheckCircle2 } from "lucide-react";
import type { ChatModel } from "@/components/ui/claude-style-chat-input";

interface ResearchStep {
  question: string;
  findings: string;
}

export default function ResearchPage() {
  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [model, setModel] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [depth, setDepth] = React.useState(4);
  const [running, setRunning] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [subQuestions, setSubQuestions] = React.useState<string[]>([]);
  const [steps, setSteps] = React.useState<ResearchStep[]>([]);
  const [report, setReport] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/models");
      if (res.ok) {
        const json = await res.json();
        // The auto router can't be used for research; pick the first real model.
        const list: ChatModel[] = (json.models ?? []).filter((m: ChatModel) => m.id !== "auto");
        setModels(list);
        if (list[0]) setModel(list[0].id);
      }
    })();
  }, []);

  async function run() {
    const q = question.trim();
    if (!q) return;
    if (!model) {
      setBanner("No model allocated. Contact your admin.");
      return;
    }
    setRunning(true);
    setBanner(null);
    setReport(null);
    setSteps([]);
    setSubQuestions([]);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, model, maxSubQuestions: depth }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Research failed");
      setSubQuestions(json.subQuestions ?? []);
      setSteps(json.steps ?? []);
      setReport(json.report ?? "");
    } catch (e) {
      setBanner((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      {/* header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/chat"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Chat
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
          >
            <Telescope className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-light leading-tight">Deep research</h1>
            <p className="text-xs text-text-400">Multi-step web research, synthesized with citations.</p>
          </div>
        </div>
      </div>

      {/* input */}
      <div className="rounded-2xl border border-bg-300 bg-bg-100 p-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do you want researched? e.g. “Compare the 2026 EV tax credits across the US, EU, and China.”"
          rows={3}
          disabled={running}
          className="w-full resize-none bg-transparent text-[15px] text-text-100 outline-none placeholder:text-text-400 disabled:opacity-50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bg-300 pt-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
            className="h-9 rounded-lg border border-bg-300 bg-background px-2.5 text-sm text-text-200 outline-none focus:border-accent"
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-400">
            Depth
            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              disabled={running}
              className="h-9 rounded-lg border border-bg-300 bg-background px-2 text-sm text-text-200 outline-none focus:border-accent"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} sub-questions
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={running || !question.trim()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {running ? "Researching…" : "Research"}
          </button>
        </div>
      </div>

      {banner && (
        <div className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {banner}
        </div>
      )}

      {running && (
        <div className="mt-6 flex items-center gap-2 text-sm text-text-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Decomposing, searching the web, and synthesizing… this can take a minute.
        </div>
      )}

      {/* plan */}
      {subQuestions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-400">
            Research plan
          </h2>
          <ul className="space-y-1.5">
            {subQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* report */}
      {report && (
        <div className="mt-6 rounded-2xl border border-bg-300 bg-bg-100 p-5">
          <div className="markdown-body prose-sm max-w-none text-[15px] leading-relaxed text-text-100">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: (props) => <h2 className="mb-2 mt-4 font-serif text-lg font-medium" {...props} />,
                h3: (props) => <h3 className="mb-1.5 mt-3 font-medium text-text-200" {...props} />,
                p: (props) => <p className="mb-3 whitespace-pre-wrap" {...props} />,
                ul: (props) => <ul className="mb-3 list-disc pl-5" {...props} />,
                ol: (props) => <ol className="mb-3 list-decimal pl-5" {...props} />,
                a: (props) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  />
                ),
                code: (props) => (
                  <code className="rounded bg-bg-300/60 px-1 py-0.5 font-mono text-[13px]" {...props} />
                ),
              }}
            >
              {report}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* per-step findings (collapsible detail) */}
      {steps.length > 0 && (
        <details className="mt-4 rounded-2xl border border-bg-300 bg-bg-100 p-4">
          <summary className="cursor-pointer text-sm font-medium text-text-200">
            Raw findings per sub-question ({steps.length})
          </summary>
          <div className="mt-3 space-y-4">
            {steps.map((s, i) => (
              <div key={i}>
                <p className="mb-1 text-sm font-medium text-text-200">{s.question}</p>
                <p className="whitespace-pre-wrap text-sm text-text-400">{s.findings}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
