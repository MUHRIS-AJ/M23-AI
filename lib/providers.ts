// Provider registry + catalog fetching for multi-provider model sync.
//
// The app talks to several OpenAI-compatible endpoints. We only ship one AI SDK
// provider package (@openrouter/ai-sdk-provider), but it speaks the universal
// `/chat/completions` wire format and accepts any `baseURL`, so it doubles as a
// client for OpenAI, custom proxies (e.g. contactboxtools.me), and OpenRouter
// itself. Per-provider differences we care about:
//   - catalog shape at GET /models  (OpenRouter is rich; OpenAI is {id} only)
//   - whether the ":online" web-search suffix is supported (OpenRouter only)
//
// `ApiKey.provider` is a free-form string; unknown providers fall back to the
// generic OpenAI-compatible behavior using the key's stored baseUrl.

import { classifyTier, type OpenRouterModel } from "@/lib/openrouter";

export interface ProviderDef {
  id: string;
  name: string;
  defaultBaseUrl: string;
  supportsOnline: boolean; // OpenRouter ":online" web plugin
  catalogShape: "openrouter" | "openai"; // how GET /models responds
}

// Known providers. `custom` is the catch-all for any OpenAI-compatible endpoint
// configured purely via the key's baseUrl (e.g. https://api.contactboxtools.me/v1).
export const PROVIDERS: ProviderDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsOnline: true,
    catalogShape: "openrouter",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsOnline: false,
    catalogShape: "openai",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    defaultBaseUrl: "",
    supportsOnline: false,
    catalogShape: "openai",
  },
];

export function getProviderDef(provider: string): ProviderDef {
  return (
    PROVIDERS.find((p) => p.id === provider) ?? {
      id: provider,
      name: provider,
      defaultBaseUrl: "",
      supportsOnline: false,
      catalogShape: "openai",
    }
  );
}

/** Does this provider support OpenRouter's ":online" web-search suffix? */
export function providerSupportsOnline(provider: string): boolean {
  return getProviderDef(provider).supportsOnline;
}

export interface SyncedModel {
  modelId: string;
  displayName: string;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
  tier: string;
}

/** Normalize one OpenRouter-format model entry. */
function fromOpenRouter(m: OpenRouterModel): SyncedModel {
  const promptPrice = parseFloat(m.pricing?.prompt ?? "0") || 0;
  const completionPrice = parseFloat(m.pricing?.completion ?? "0") || 0;
  return {
    modelId: m.id,
    displayName: m.name || m.id,
    promptPrice,
    completionPrice,
    contextLength: m.context_length ?? 0,
    tier: classifyTier(promptPrice, completionPrice),
  };
}

interface OpenAIModelEntry {
  id: string;
  // some proxies include extra hints; read them defensively
  context_length?: number;
  context_window?: number;
  pricing?: { prompt?: string; completion?: string };
}

/** Normalize one OpenAI-format model entry (pricing usually unknown). */
function fromOpenAI(m: OpenAIModelEntry): SyncedModel {
  const promptPrice = parseFloat(m.pricing?.prompt ?? "0") || 0;
  const completionPrice = parseFloat(m.pricing?.completion ?? "0") || 0;
  const ctx = m.context_length ?? m.context_window ?? 0;
  return {
    modelId: m.id,
    displayName: m.id,
    promptPrice,
    completionPrice,
    contextLength: ctx,
    // No pricing from OpenAI-style catalogs → mark PAID so it isn't treated as
    // free; the admin can re-tier and enable as needed.
    tier: promptPrice === 0 && completionPrice === 0 ? "PAID" : classifyTier(promptPrice, completionPrice),
  };
}

/**
 * Fetch the model catalog for a provider key. Handles both catalog shapes.
 * `baseUrl` (the key's stored override) wins over the provider default.
 */
export async function fetchProviderModels(
  provider: string,
  apiKey: string,
  baseUrl?: string | null
): Promise<SyncedModel[]> {
  const def = getProviderDef(provider);
  const base = (baseUrl || def.defaultBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    throw new Error(
      `No base URL for provider "${provider}". Set a Base URL on the API key.`
    );
  }

  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${def.name} /models failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: unknown[] };
  const data = Array.isArray(json.data) ? json.data : [];

  if (def.catalogShape === "openrouter") {
    return data.map((m) => fromOpenRouter(m as OpenRouterModel));
  }
  return data.map((m) => fromOpenAI(m as OpenAIModelEntry));
}
