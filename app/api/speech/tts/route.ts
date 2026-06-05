import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { recordUsage } from "@/lib/usage";
import { resolveProviderKey } from "@/lib/provider-keys";

export const maxDuration = 60;

const OPENAI_BASE = "https://api.openai.com/v1";

interface TtsBody {
  text: string;
  voice?: string;
  model?: string;
}

// Cloud Text-to-Speech fallback. Browser-native speechSynthesis is the primary
// path (client-side); this endpoint produces higher-quality audio when an
// "openai" (or "custom" OpenAI-compatible) key is allocated. Streams mp3 back.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as TtsBody;
    const text = (body.text ?? "").trim();
    if (!text) throw new AuthError(400, "No text provided");

    const key = await resolveProviderKey(user.id, user.role, ["openai", "custom"]);
    if (!key) {
      throw new AuthError(
        403,
        "Cloud speech needs an OpenAI-compatible API key. Your browser's built-in voice is used otherwise."
      );
    }

    const base = (key.baseUrl || OPENAI_BASE).replace(/\/$/, "");
    const res = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model || "tts-1",
        voice: body.voice || "alloy",
        input: text.slice(0, 4096), // OpenAI hard limit
        response_format: "mp3",
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => res.statusText);
      throw new AuthError(502, `Speech synthesis failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    await recordUsage({
      userId: user.id,
      apiKeyId: key.id,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    }).catch(() => {});

    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
