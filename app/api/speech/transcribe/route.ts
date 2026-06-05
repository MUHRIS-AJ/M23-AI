import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { recordUsage } from "@/lib/usage";
import { resolveProviderKey } from "@/lib/provider-keys";

export const maxDuration = 60;

const OPENAI_BASE = "https://api.openai.com/v1";

// Cloud Speech-to-Text fallback. The browser-native Web Speech API is the
// primary path (handled client-side); this endpoint is used when the browser
// lacks support OR the user prefers cloud transcription. Requires an
// "openai" (or "custom" OpenAI-compatible) key to be allocated.
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const form = await req.formData();
    const audio = form.get("audio");
    const model = (form.get("model") as string) || "whisper-1";
    if (!(audio instanceof Blob)) {
      throw new AuthError(400, "No audio file provided");
    }

    const key = await resolveProviderKey(user.id, user.role, ["openai", "custom"]);
    if (!key) {
      throw new AuthError(
        403,
        "Cloud transcription needs an OpenAI-compatible API key. Use your browser's built-in mic, or ask your admin to allocate a key."
      );
    }

    const base = (key.baseUrl || OPENAI_BASE).replace(/\/$/, "");
    const upstream = new FormData();
    upstream.append("file", audio, "audio.webm");
    upstream.append("model", model);

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.apiKey}` },
      body: upstream,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new AuthError(502, `Transcription failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as { text?: string };

    // Best-effort usage note (transcription is priced by audio minutes, which we
    // don't measure here; record a zero-cost marker for traceability).
    await recordUsage({
      userId: user.id,
      apiKeyId: key.id,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    }).catch(() => {});

    return Response.json({ text: json.text ?? "" });
  } catch (err) {
    return errorResponse(err);
  }
}
