// Live balance lookup per provider. Returns the remaining USD balance when the
// provider exposes it, or null when it must be tracked manually (OpenAI doesn't
// publish a key-balance endpoint).
import { fetchOpenRouterBalance } from "./openrouter";

export interface BalanceResult {
  /** Remaining USD balance, or null if this provider can't report it live. */
  balanceUsd: number | null;
  /** Whether the provider supports live balance lookup at all. */
  supported: boolean;
  /** Optional human note (e.g. why it's null). */
  note?: string;
}

/** Providers we can query a live balance for. */
export const LIVE_BALANCE_PROVIDERS = ["openrouter", "stability"];

export async function fetchProviderBalance(
  provider: string,
  apiKey: string,
  baseUrl?: string | null
): Promise<BalanceResult> {
  switch (provider) {
    case "openrouter": {
      const bal = await fetchOpenRouterBalance(apiKey, baseUrl ?? undefined);
      return bal === null
        ? { balanceUsd: null, supported: true, note: "OpenRouter did not return a balance." }
        : { balanceUsd: bal, supported: true };
    }
    case "stability": {
      const bal = await fetchStabilityBalance(apiKey, baseUrl ?? undefined);
      return bal === null
        ? { balanceUsd: null, supported: true, note: "Stability did not return a balance." }
        : { balanceUsd: bal, supported: true };
    }
    default:
      // OpenAI and custom providers don't expose a key-balance endpoint.
      return {
        balanceUsd: null,
        supported: false,
        note: "This provider has no balance API — track the balance manually.",
      };
  }
}

// Stability AI: GET /v1/user/balance → { credits: number }. Stability "credits"
// are their own unit (roughly cents-scale); we report the raw number and label
// it as credits in the UI rather than pretending it's exact USD.
async function fetchStabilityBalance(apiKey: string, baseUrl?: string): Promise<number | null> {
  try {
    const base = (baseUrl || "https://api.stability.ai").replace(/\/$/, "");
    const res = await fetch(`${base}/v1/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { credits?: number };
    return typeof json.credits === "number" ? json.credits : null;
  } catch {
    return null;
  }
}
