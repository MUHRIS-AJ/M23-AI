// Auto model router: inspect the conversation and pick the best-fit model from
// the set a user is allowed to use. Simple, explainable heuristics — no extra
// model call — so routing is instant and free.
//
// Capability is proxied by price + context length (within OpenRouter, pricier
// models are generally stronger). Complexity is scored from the latest user
// turn. Low complexity → cheapest capable model; high → most capable.

export interface RoutableModel {
  modelId: string;
  displayName: string;
  tier: string; // FREE | ZERO_COST | PAID
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
}

export interface RouteDecision {
  model: RoutableModel;
  complexity: number; // 0..1
  reason: string;
}

export const FREE_MODELS: RoutableModel[] = [
  {
    modelId: "google/gemma-3-1b-it:free",
    displayName: "Gemma 3 1B (Free)",
    tier: "FREE",
    promptPrice: 0.00000001,
    completionPrice: 0.00000001,
    contextLength: 32768,
  },
  {
    modelId: "google/gemma-3-4b-it:free",
    displayName: "Gemma 3 4B (Free)",
    tier: "FREE",
    promptPrice: 0.00000003,
    completionPrice: 0.00000003,
    contextLength: 32768,
  },
  {
    modelId: "google/gemma-3-12b-it:free",
    displayName: "Gemma 3 12B (Free)",
    tier: "FREE",
    promptPrice: 0.00000007,
    completionPrice: 0.00000007,
    contextLength: 32768,
  },
  {
    modelId: "google/gemma-3-27b-it:free",
    displayName: "Gemma 3 27B (Free)",
    tier: "FREE",
    promptPrice: 0.00000015,
    completionPrice: 0.00000015,
    contextLength: 32768,
  },
  {
    modelId: "meta-llama/llama-4-scout:free",
    displayName: "Llama 4 Scout (Free)",
    tier: "FREE",
    promptPrice: 0.00000020,
    completionPrice: 0.00000020,
    contextLength: 32768,
  },
  {
    modelId: "deepseek/deepseek-chat-v3-0324:free",
    displayName: "DeepSeek V3 (Free)",
    tier: "FREE",
    promptPrice: 0.00000014,
    completionPrice: 0.00000028,
    contextLength: 64000,
  },
  {
    modelId: "qwen/qwen3-235b-a22b:free",
    displayName: "Qwen 3 235B (Free)",
    tier: "FREE",
    promptPrice: 0.00000040,
    completionPrice: 0.00000040,
    contextLength: 32768,
  },
];

/** Heuristic complexity score in [0,1] for the most recent user message(s). */
export function scoreComplexity(text: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  const len = text.length;

  let score = 0;

  // Length: longer asks tend to be harder. ~1200+ chars saturates this term.
  score += Math.min(len / 1200, 1) * 0.35;

  // Code / structured content signals depth.
  if (/```|\bfunction\b|\bclass\b|=>|import \w|def |select .* from |<\/?\w+>/.test(t)) {
    score += 0.25;
  }

  // Reasoning verbs: tasks that need analysis, not recall.
  const reasoningWords = [
    "explain", "why", "prove", "analy", "debug", "design", "architect",
    "compare", "optimize", "refactor", "derive", "evaluate", "trade-off",
    "tradeoff", "strategy", "algorithm", "complex", "step by step", "reason",
  ];
  const hits = reasoningWords.filter((w) => t.includes(w)).length;
  score += Math.min(hits * 0.08, 0.3);

  // Multi-part questions (several "?" or enumerated items) add load.
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks >= 2) score += 0.08;
  if (/\b(\d+\.\s|\n- |\n\* )/.test(text)) score += 0.07;

  return Math.max(0, Math.min(score, 1));
}

/** A 0..1 capability proxy for a model (price-weighted, context-aware). */
function capabilityRank(m: RoutableModel): number {
  // Average token price drives most of the signal.
  const avgPrice = (m.promptPrice + m.completionPrice) / 2;
  // Map price across a wide log range ($0 .. ~$0.00003/token) to 0..1.
  const priceTerm = avgPrice <= 0 ? 0 : Math.min(Math.log10(avgPrice * 1e6 + 1) / 2, 1);
  const ctxTerm = Math.min(m.contextLength / 200000, 1);
  return priceTerm * 0.8 + ctxTerm * 0.2;
}

/**
 * Pick the best model for the conversation.
 * @param models  the models the user may use (already filtered + enabled)
 * @param latestUserText  the newest user message text
 */
export function routeModel(models: RoutableModel[], latestUserText: string): RouteDecision | null {
  const candidates = models && models.length > 0 ? models : FREE_MODELS;

  const complexity = scoreComplexity(latestUserText);

  // Order weakest → strongest by capability proxy.
  const ranked = [...candidates].sort((a, b) => capabilityRank(a) - capabilityRank(b));

  // Map complexity to a position in the ranked list.
  // ≤0.33 → cheapest third, ≤0.66 → middle, else → strongest.
  let idx: number;
  if (complexity <= 0.33) {
    idx = 0;
  } else if (complexity <= 0.66) {
    idx = Math.floor((ranked.length - 1) * 0.5);
  } else {
    idx = ranked.length - 1;
  }

  const model = ranked[idx];
  const band = complexity <= 0.33 ? "simple" : complexity <= 0.66 ? "moderate" : "complex";
  return {
    model,
    complexity,
    reason: `${band} request (score ${complexity.toFixed(2)}) → ${model.displayName}`,
  };
}

/** Sentinel id used by the UI to request auto routing. */
export const AUTO_MODEL_ID = "auto";
