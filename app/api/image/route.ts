import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { getCapStatus, recordUsage } from "@/lib/usage";
import { resolveAllProviderKeys } from "@/lib/provider-keys";
import {
  generateImage,
  IMAGE_MODELS,
  getImageModelCandidates,
  isBuiltinImageProvider,
  pickImageProviderOrder,
} from "@/lib/image";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface ImageBody {
  prompt: string;
  provider?: string; // optional explicit provider; otherwise auto-pick
  model?: string;
  size?: string;
  conversationId?: string;
}

// Providers we know how to generate images with, in preference order.
const IMAGE_PROVIDERS = ["openai", "stability", "openrouter", "custom"];

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ImageBody;
    const prompt = (body.prompt ?? "").trim();
    let conversationId = body.conversationId;

    if (!prompt) throw new AuthError(400, "No prompt provided");

    // ── 1. Cost cap check ─────────────────────────────────────
    const cap = await getCapStatus(user.id);
    if (cap.exceeded) {
      throw new AuthError(
        402,
        `Budget limit reached (${cap.spentUsd.toFixed(4)} / ${cap.capUsd?.toFixed(
          2
        )} USD this ${cap.period.toLowerCase()}). Contact your admin.`
      );
    }

    // ── 2. Resolve all usable keys in provider preference order ─────────
    const providerOrder = body.provider ? [body.provider] : pickImageProviderOrder(prompt);
    const allKeys = await resolveAllProviderKeys(user.id, user.role);
    const keys = body.provider
      ? allKeys.filter((key) => key.provider === body.provider)
      : allKeys.sort((a, b) => {
          const rank = (provider: string) => {
            const idx = providerOrder.indexOf(provider);
            return idx >= 0 ? idx : providerOrder.length + 1;
          };
          return rank(a.provider) - rank(b.provider);
        });
    const usableKeys = body.provider
      ? keys
      : keys.filter((key) => isBuiltinImageProvider(key.provider));

    if (usableKeys.length === 0) {
      if (keys.some((key) => key.provider === "custom")) {
        throw new AuthError(
          403,
          "Your allocated custom API key is not set up for image generation. Use an OpenAI, Stability, or OpenRouter image-capable key, or send a specific provider model in the request."
        );
      }
      throw new AuthError(
        403,
        "No image-capable API key allocated to your account. Contact your admin."
      );
    }

    // ── 3. Generate with provider/model fallback ──────────────
    let key = usableKeys[0];
    let result: Awaited<ReturnType<typeof generateImage>> | null = null;
    const errors: string[] = [];

    for (const candidateKey of usableKeys) {
      const modelCandidates = getImageModelCandidates(candidateKey.provider, body.model);
      if (modelCandidates.length === 0) {
        errors.push(`${candidateKey.provider}: no image model candidates configured`);
        continue;
      }
      for (const model of modelCandidates) {
        try {
          result = await generateImage({
            provider: candidateKey.provider,
            apiKey: candidateKey.apiKey,
            baseUrl: candidateKey.baseUrl ?? undefined,
            prompt,
            model,
            size: body.size,
          });
          key = candidateKey;
          break;
        } catch (err) {
          errors.push(`${candidateKey.provider}/${model}: ${(err as Error).message}`);
        }
      }
      if (result) break;
    }

    if (!result) {
      throw new Error(
        `No image provider/model combination worked. Tried: ${errors.slice(0, 6).join(" | ")}`
      );
    }

    // ── 4. Persist conversation + messages (embed image as md) ─
    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: {
          userId: user.id,
          title: prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt,
        },
      });
      conversationId = created.id;
    }

    await prisma.message.create({
      data: { conversationId, role: "user", content: prompt },
    });

    // Strip markdown-breaking brackets from the alt text.
    const altText = prompt.replace(/[[\]]/g, "");
    const content = `![${altText}](${result.dataUri})`;

    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content,
        costUsd: result.costUsd ?? 0,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // ── 5. Record usage (image APIs are per-image, not per-token) ─
    await recordUsage({
      userId: user.id,
      modelId: null,
      apiKeyId: key.id,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: result.costUsd ?? 0,
    });

    return Response.json(
      { conversationId, content, dataUri: result.dataUri, model: result.rawModel },
      { headers: { "x-conversation-id": conversationId } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// Lets the client know which providers/models could be used (not required).
export async function GET() {
  try {
    const user = await requireUser();
    const keys = await resolveAllProviderKeys(user.id, user.role);
    const supported = new Set(IMAGE_PROVIDERS.filter(isBuiltinImageProvider));

    const providers = Array.from(
      new Set(keys.map((key) => (supported.has(key.provider) ? key.provider : null)).filter(Boolean))
    ) as string[];

    const models = Object.fromEntries(
      providers.map((provider) => [provider, IMAGE_MODELS[provider] ?? IMAGE_MODELS.custom])
    );

    return Response.json({ providers, models });
  } catch (err) {
    return errorResponse(err);
  }
}
