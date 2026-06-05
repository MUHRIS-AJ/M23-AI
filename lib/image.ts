// Multi-provider image generation. Dispatches on the free-form ApiKey.provider
// string and always returns a base64 data URI so the result can be embedded
// directly into Message.content as markdown — no file-storage backend required.
//
// Size tradeoff: a 1024x1024 PNG as base64 is ~1–2 MB of TEXT stored in the
// message content and re-sent on every conversation load. Default to 1024x1024
// but expose `size` so callers can drop to 512x512 (~4x smaller) when needed.

const OPENAI_BASE = "https://api.openai.com/v1";
const STABILITY_BASE = "https://api.stability.ai";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Default image model per provider. Callers may override via `model`. */
export const IMAGE_MODELS: Record<string, string> = {
  openai: "gpt-image-1",
  stability: "core",
  openrouter: "google/gemini-2.5-flash-image-preview",
  custom: "gpt-image-1",
};

export const IMAGE_MODEL_CANDIDATES: Record<string, string[]> = {
  openai: ["gpt-image-1", "dall-e-3"],
  stability: ["core", "ultra", "sd3"],
  openrouter: ["google/gemini-2.5-flash-image-preview", "google/gemini-2.0-flash-image-preview"],
  custom: [],
};

export function pickImageProviderOrder(prompt: string): string[] {
  const text = prompt.toLowerCase();
  const photorealistic = /\b(photo|photoreal|realistic|portrait|landscape|product|cinematic|scene|render)\b/.test(text);
  const illustration = /\b(logo|icon|illustration|sticker|cartoon|vector|flat design|poster|line art|anime)\b/.test(text);

  if (photorealistic) {
    return ["stability", "openai", "custom", "openrouter"];
  }

  if (illustration) {
    return ["openai", "custom", "stability", "openrouter"];
  }

  return ["openai", "custom", "stability", "openrouter"];
}

export function getImageModelCandidates(provider: string, explicitModel?: string): string[] {
  if (explicitModel?.trim()) return [explicitModel.trim()];
  return IMAGE_MODEL_CANDIDATES[provider] ?? [IMAGE_MODELS[provider] || IMAGE_MODELS.openai];
}

export function isBuiltinImageProvider(provider: string): boolean {
  return provider === "openai" || provider === "stability" || provider === "openrouter";
}

export interface GenImageParams {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  model?: string;
  size?: string; // e.g. "1024x1024" | "512x512"
}

export interface GenImageResult {
  dataUri: string; // "data:image/png;base64,...."
  costUsd?: number;
  rawModel: string;
}

/** Entry point: route to the right provider implementation. */
export async function generateImage(p: GenImageParams): Promise<GenImageResult> {
  switch (p.provider) {
    case "openai":
      return genOpenAICompatible(p, OPENAI_BASE);
    case "stability":
      return genStability(p);
    case "openrouter":
      return genOpenRouter(p);
    case "custom":
    default:
      // Any other provider is assumed OpenAI-compatible; baseUrl is required for it
      // to point anywhere other than OpenAI itself.
      return genOpenAICompatible(p, OPENAI_BASE);
  }
}

// ── OpenAI / OpenAI-compatible (custom) ───────────────────────
async function genOpenAICompatible(
  p: GenImageParams,
  fallbackBase: string
): Promise<GenImageResult> {
  const base = (p.baseUrl || fallbackBase).replace(/\/$/, "");
  const model = p.model || IMAGE_MODELS[p.provider] || IMAGE_MODELS.openai;
  const size = p.size || "1024x1024";

  const body: Record<string, unknown> = {
    model,
    prompt: p.prompt,
    size,
    n: 1,
  };
  // dall-e-3 needs an explicit response_format; gpt-image-1 always returns b64.
  if (/dall-e/i.test(model)) body.response_format = "b64_json";

  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Image API error (${res.status}): ${await safeErr(res)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = json.data?.[0];
  if (item?.b64_json) {
    return { dataUri: `data:image/png;base64,${item.b64_json}`, rawModel: model };
  }
  if (item?.url) {
    return { dataUri: await urlToDataUri(item.url), rawModel: model };
  }
  throw new Error("Image API returned no image data");
}

// ── Stability AI (v2beta stable-image) ────────────────────────
async function genStability(p: GenImageParams): Promise<GenImageResult> {
  const base = (p.baseUrl || STABILITY_BASE).replace(/\/$/, "");
  const model = p.model || IMAGE_MODELS.stability; // "core" | "ultra" | "sd3"

  const form = new FormData();
  form.append("prompt", p.prompt);
  form.append("output_format", "png");

  const res = await fetch(`${base}/v2beta/stable-image/generate/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      Accept: "image/*",
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Stability API error (${res.status}): ${await safeErr(res)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { dataUri: `data:image/png;base64,${buf.toString("base64")}`, rawModel: model };
}

// ── OpenRouter (image-capable chat models) ────────────────────
async function genOpenRouter(p: GenImageParams): Promise<GenImageResult> {
  const base = (p.baseUrl || OPENROUTER_BASE).replace(/\/$/, "");
  const model = p.model || IMAGE_MODELS.openrouter;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.AUTH_URL || "http://localhost:3000",
      "X-Title": "Team AI Chat",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: p.prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter image error (${res.status}): ${await safeErr(res)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { images?: Array<{ image_url?: { url?: string } }> };
    }>;
  };
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("OpenRouter returned no image (model may not support image output)");
  // OpenRouter returns a data URI already; pass URLs through the inliner just in case.
  return {
    dataUri: url.startsWith("data:") ? url : await urlToDataUri(url),
    rawModel: model,
  };
}

// ── helpers ───────────────────────────────────────────────────
async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

async function safeErr(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return res.statusText;
  }
}
