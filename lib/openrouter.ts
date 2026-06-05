// OpenRouter helpers: provider/client factory + model catalog sync.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Build an AI SDK provider bound to a specific decrypted API key. */
export function getOpenRouterProvider(apiKey: string, baseUrl?: string) {
  return createOpenRouter({
    apiKey,
    baseURL: baseUrl || OPENROUTER_BASE,
    // Optional attribution headers (shown on openrouter.ai dashboards)
    headers: {
      "HTTP-Referer": process.env.AUTH_URL || "http://localhost:3000",
      "X-Title": "Team AI Chat",
    },
  });
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

/** Classify a model into our tier based on its pricing. */
export function classifyTier(promptPrice: number, completionPrice: number): string {
  if (promptPrice === 0 && completionPrice === 0) return "FREE";
  // Negligible cost (some promo/preview models price extremely low)
  if (promptPrice < 1e-7 && completionPrice < 1e-7) return "ZERO_COST";
  return "PAID";
}

/** Fetch the full model catalog from OpenRouter using a decrypted key. */
export async function fetchOpenRouterModels(
  apiKey: string,
  baseUrl?: string
): Promise<OpenRouterModel[]> {
  const res = await fetch(`${(baseUrl || OPENROUTER_BASE).replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: OpenRouterModel[] };
  return json.data ?? [];
}

/** Query the cost of a single generation by id (OpenRouter returns native USD cost). */
export async function fetchGenerationCost(
  apiKey: string,
  generationId: string,
  baseUrl?: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `${(baseUrl || OPENROUTER_BASE).replace(/\/$/, "")}/generation?id=${generationId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { total_cost?: number } };
    return json.data?.total_cost ?? null;
  } catch {
    return null;
  }
}

/** Live credit balance for an OpenRouter key (remaining USD). */
export async function fetchOpenRouterBalance(
  apiKey: string,
  baseUrl?: string
): Promise<number | null> {
  try {
    const res = await fetch(`${(baseUrl || OPENROUTER_BASE).replace(/\/$/, "")}/credits`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    // /credits → { data: { total_credits, total_usage } } (both USD).
    const json = (await res.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    const total = json.data?.total_credits;
    const used = json.data?.total_usage;
    if (typeof total === "number" && typeof used === "number") {
      return Math.max(0, total - used);
    }
    return null;
  } catch {
    return null;
  }
}
