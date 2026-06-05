// Deep research agent: decompose a question, research each part with web search
// in parallel, then synthesize a single cited report.
//
// Uses generateText only (no structured-output mode) so it works across any
// OpenRouter model. Web search is enabled per sub-query via the ":online" suffix.
import { generateText } from "ai";
import type { LanguageModelUsage } from "ai";

type Provider = (modelId: string) => Parameters<typeof generateText>[0]["model"];

export interface ResearchStep {
  question: string;
  findings: string;
}

export interface ResearchResult {
  report: string;
  steps: ResearchStep[];
  subQuestions: string[];
  usage: { promptTokens: number; completionTokens: number };
}

function addUsage(
  acc: { promptTokens: number; completionTokens: number },
  u: LanguageModelUsage | undefined
) {
  acc.promptTokens += u?.promptTokens ?? 0;
  acc.completionTokens += u?.completionTokens ?? 0;
}

/** Pull a JSON array of strings out of a model response, with line-based fallback. */
function parseSubQuestions(text: string, max: number): string[] {
  // Try a fenced or bare JSON array first.
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const qs = arr.map((x) => String(x).trim()).filter(Boolean);
        if (qs.length) return qs.slice(0, max);
      }
    } catch {
      /* fall through */
    }
  }
  // Fallback: numbered / bulleted lines.
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim())
    .filter((l) => l.length > 8 && l.includes("?"))
    .slice(0, max);
}

export interface RunResearchParams {
  provider: Provider;
  model: string; // base OpenRouter modelId (without :online)
  question: string;
  maxSubQuestions?: number;
}

export async function runResearch(p: RunResearchParams): Promise<ResearchResult> {
  const max = p.maxSubQuestions ?? 4;
  const usage = { promptTokens: 0, completionTokens: 0 };

  // ── 1. Decompose ──────────────────────────────────────────
  const decomposed = await generateText({
    model: p.provider(p.model),
    prompt:
      `You are a research planner. Break the user's question into ${max} focused, ` +
      `self-contained sub-questions that together fully answer it. Each must end with "?".\n` +
      `Return ONLY a JSON array of strings, no prose.\n\n` +
      `Question: ${p.question}`,
  });
  addUsage(usage, decomposed.usage);

  let subQuestions = parseSubQuestions(decomposed.text, max);
  if (subQuestions.length === 0) subQuestions = [p.question];

  // ── 2. Research each sub-question in parallel (web search) ─
  const onlineModel = `${p.model}:online`;
  const settled = await Promise.allSettled(
    subQuestions.map((q) =>
      generateText({
        model: p.provider(onlineModel),
        prompt:
          `Research this question using up-to-date web sources. Give a concise, factual ` +
          `summary (4-8 sentences) and include source URLs inline as [n] with a short ` +
          `"Sources:" list at the end.\n\nQuestion: ${q}`,
      })
    )
  );

  const steps: ResearchStep[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      addUsage(usage, r.value.usage);
      steps.push({ question: subQuestions[i], findings: r.value.text });
    } else {
      steps.push({
        question: subQuestions[i],
        findings: "_(research for this sub-question failed)_",
      });
    }
  });

  // ── 3. Synthesize ─────────────────────────────────────────
  const dossier = steps
    .map((s, i) => `### Sub-question ${i + 1}: ${s.question}\n${s.findings}`)
    .join("\n\n");

  const synthesis = await generateText({
    model: p.provider(p.model),
    prompt:
      `You are a research analyst. Using ONLY the findings below, write a well-structured ` +
      `markdown report that directly answers the original question. Use headings, be specific, ` +
      `note disagreements or gaps, and keep a consolidated "## Sources" section at the end with ` +
      `the URLs referenced.\n\n` +
      `Original question: ${p.question}\n\n` +
      `Findings:\n${dossier}`,
  });
  addUsage(usage, synthesis.usage);

  return { report: synthesis.text, steps, subQuestions, usage };
}
