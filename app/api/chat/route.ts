import { streamText, type CoreMessage } from "ai";
import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";
import { getOpenRouterProvider, fetchGenerationCost } from "@/lib/openrouter";
import { getCapStatus, recordUsage, estimateCost } from "@/lib/usage";
import { routeModel, AUTO_MODEL_ID, FREE_MODELS } from "@/lib/auto-model";
import { loadMcpTools, closeMcpClients } from "@/lib/mcp";
import { buildSystemPrompt, type ActiveSkill } from "@/lib/system-prompt";
import { getWebTools } from "@/lib/web-tools";
import { providerSupportsOnline } from "@/lib/providers";

export const maxDuration = 60;

interface ChatBody {
  messages: CoreMessage[];
  model: string; // OpenRouter modelId, e.g. "openai/gpt-4o"
  conversationId?: string;
  webSearch?: boolean; // when true, route through OpenRouter's :online web plugin
  temporary?: boolean; // when true, do not persist conversation/messages (usage IS still recorded)
  skillIds?: string[]; // active skills to apply to this turn (system-prompt overlays)
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ChatBody;
    const { messages } = body;
    let modelId = body.model;
    let conversationId = body.conversationId;

    if (!modelId) throw new AuthError(400, "No model selected");
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AuthError(400, "No messages provided");
    }

    // ── 0. Auto model routing ─────────────────────────────────
    // "auto" picks the best-fit model from the user's allowed set based on the
    // complexity of their latest message (cheap for simple, strong for hard).
    if (modelId === AUTO_MODEL_ID) {
      const candidates = await prisma.model.findMany({
        where: {
          enabled: true,
          OR: [
            { tier: { in: ["FREE", "ZERO_COST"] } },
            ...(user.role === "ADMIN" ? [{}] : [{ users: { some: { userId: user.id } } }]),
          ],
        },
      });
      const lastUserText = contentToString(
        [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
      );
      let routableCandidates = candidates.map((c) => ({
        modelId: c.modelId,
        displayName: c.displayName,
        tier: c.tier,
        promptPrice: c.promptPrice,
        completionPrice: c.completionPrice,
        contextLength: c.contextLength,
      }));

      // Fallback to built-in free models if DB is empty
      if (routableCandidates.length === 0) {
        routableCandidates = FREE_MODELS;
      }

      const decision = routeModel(routableCandidates, lastUserText);
      if (!decision) {
        throw new AuthError(403, "No models available for auto routing. Contact your admin.");
      }
      modelId = decision.model.modelId;
    }

    // ── 1. Model must exist + be enabled ──────────────────────
    let model = await prisma.model.findUnique({ where: { modelId } });
    if (!model) {
      // Create built-in free model dynamically if it doesn't exist in DB yet
      const builtInFree = FREE_MODELS.find((m) => m.modelId === modelId);
      if (builtInFree) {
        model = await prisma.model.create({
          data: {
            modelId: builtInFree.modelId,
            displayName: builtInFree.displayName,
            provider: "openrouter",
            tier: "FREE",
            promptPrice: builtInFree.promptPrice,
            completionPrice: builtInFree.completionPrice,
            contextLength: builtInFree.contextLength,
            custom: false,
            enabled: true,
          },
        });
      }
    }

    if (!model || !model.enabled) {
      throw new AuthError(400, "Model is not available");
    }

    // ── 2. User must be allocated this model ──────────────────
    // Free models do not require allocation
    let allowed = false;
    if (model.tier === "FREE" || model.tier === "ZERO_COST") {
      allowed = true;
    } else {
      const dbAllowed = await prisma.userModel.findUnique({
        where: { userId_modelId: { userId: user.id, modelId: model.id } },
      });
      if (dbAllowed) allowed = true;
    }

    if (!allowed && user.role !== "ADMIN") {
      throw new AuthError(403, "You are not allocated this model");
    }

    // ── 3. Cost cap check (skip for free + admin) ─────────────
    const cap = await getCapStatus(user.id);
    if (cap.exceeded && model.tier === "PAID") {
      throw new AuthError(
        402,
        `Budget limit reached (${cap.spentUsd.toFixed(4)} / ${cap.capUsd?.toFixed(2)} USD this ${cap.period.toLowerCase()}). Contact your admin.`
      );
    }

    // ── 4. Resolve an allocated API key for this provider ─────
    // Models are tagged with the provider that serves them; route to a key of
    // that provider. The OpenRouter AI-SDK provider speaks the universal
    // /chat/completions wire format, so it doubles as a client for OpenAI and
    // any OpenAI-compatible proxy (via the key's baseUrl).
    const provider_ = model.provider || "openrouter";
    const userKey = await prisma.userApiKey.findFirst({
      where: { userId: user.id, apiKey: { provider: provider_ } },
      include: { apiKey: true },
    });
    // Admins may fall back to any key of the right provider.
    // For free models, if no key is assigned, we can also fall back to any key of the right provider.
    const apiKeyRow =
      userKey?.apiKey ??
      (user.role === "ADMIN"
        ? await prisma.apiKey.findFirst({ where: { provider: provider_ } })
        : null) ??
      ((model.tier === "FREE" || model.tier === "ZERO_COST")
        ? await prisma.apiKey.findFirst({ where: { provider: provider_ } })
        : null);

    if (!apiKeyRow) {
      throw new AuthError(
        403,
        `No ${provider_} API key allocated to your account. Contact your admin.`
      );
    }

    const apiKey = decrypt(apiKeyRow.keyEncrypted);
    const provider = getOpenRouterProvider(apiKey, apiKeyRow.baseUrl ?? undefined);

    const lastUserText = contentToString(
      [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    );
    const hasWebSearchIntent = detectWebSearchIntent(lastUserText);
    const isWebSearchEnabled = body.webSearch === true || hasWebSearchIntent;

    // Web search: OpenRouter's ":online" suffix attaches a web plugin to any
    // model — but only OpenRouter supports it. For other providers we still
    // enable the read_url tool (below) but don't mangle the model id.
    const effectiveModelId =
      isWebSearchEnabled && providerSupportsOnline(provider_) ? `${modelId}:online` : modelId;

    // ── 5. Persist conversation + the incoming user message ───
    // Temporary chats skip all persistence (no conversation, no messages) but
    // still record usage below so cost caps can't be bypassed.
    const temporary = body.temporary === true;
    if (!temporary) {
      if (!conversationId) {
        const created = await prisma.conversation.create({
          data: {
            userId: user.id,
            modelId: model.id,
            title: deriveTitle(messages),
          },
        });
        conversationId = created.id;
      }
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        await prisma.message.create({
          data: {
            conversationId,
            role: "user",
            content: contentToString(lastUser.content),
          },
        });
      }
    }

    // ── 6. Load MCP tools (best-effort) ───────────────────────
    const { tools: mcpTools, clients } = await loadMcpTools();
    // We always include `read_url` tool (from getWebTools()) so the model can read URLs pasted by the user.
    const tools: Record<string, unknown> = { ...mcpTools, ...getWebTools() };

    // ── 6b. Assemble the system prompt ────────────────────────
    // Personalization (persona, personality text, response style, preferred
    // name) lives on the User row; active skills are passed per-turn by the
    // client and resolved here (must be the user's own or a global skill).
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        preferredName: true,
        personality: true,
        personaPreset: true,
        responseStyle: true,
      },
    });

    let activeSkills: ActiveSkill[] = [];
    const skillIds = Array.isArray(body.skillIds) ? body.skillIds.filter(Boolean) : [];
    if (skillIds.length > 0) {
      const rows = await prisma.skill.findMany({
        where: {
          id: { in: skillIds.slice(0, 10) },
          enabled: true,
          OR: [{ userId: user.id }, { scope: "GLOBAL", userId: null }],
        },
        select: { name: true, instructions: true },
      });

      activeSkills = rows;
    }

    const systemPrompt = buildSystemPrompt({
      preferredName: profile?.preferredName,
      personality: profile?.personality,
      personaPreset: profile?.personaPreset,
      responseStyle: profile?.responseStyle,
      skills: activeSkills,
      webSearch: isWebSearchEnabled,
    });

    // ── 7. Stream the completion ──────────────────────────────
    const result = streamText({
      model: provider(effectiveModelId),
      system: systemPrompt || undefined,
      messages,
      tools: Object.keys(tools).length > 0 ? (tools as never) : undefined,
      maxSteps: 5,
      async onFinish({ usage, text, response }) {
        try {
          const promptTokens = usage?.promptTokens ?? 0;
          const completionTokens = usage?.completionTokens ?? 0;

          // Prefer OpenRouter's real charged cost for this generation; fall back
          // to the token-price estimate if the lookup is unavailable.
          const estimated = estimateCost(
            promptTokens,
            completionTokens,
            model.promptPrice,
            model.completionPrice
          );
          let costUsd = estimated;
          const genId = response?.id;
          // The /generation cost lookup is OpenRouter-specific; skip it for
          // other providers (they'd 404) and just use the token estimate.
          if (genId && provider_ === "openrouter") {
            const real = await fetchGenerationCost(
              apiKey,
              genId,
              apiKeyRow.baseUrl ?? undefined
            );
            if (real !== null) costUsd = real;
          }

          await recordUsage({
            userId: user.id,
            modelId: model.id,
            apiKeyId: apiKeyRow.id,
            promptTokens,
            completionTokens,
            costUsd,
          });

          // Temporary chats are not persisted.
          if (!temporary && conversationId) {
            await prisma.message.create({
              data: {
                conversationId,
                role: "assistant",
                content: text,
                tokens: completionTokens,
                costUsd,
              },
            });
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });
          }
        } catch (err) {
          console.error("[chat] onFinish persistence failed:", err);
        } finally {
          await closeMcpClients(clients);
        }
      },
      async onError() {
        await closeMcpClients(clients);
      },
    });

    return result.toDataStreamResponse({
      headers: conversationId ? { "x-conversation-id": conversationId } : undefined,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// ── helpers ─────────────────────────────────────────────────
function contentToString(content: CoreMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? (part as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

function deriveTitle(messages: CoreMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const text = contentToString(first.content).trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text || "New chat";
}

function detectWebSearchIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const searchKeywords = [
    "search for",
    "search the web",
    "find online",
    "latest news",
    "current price",
    "weather today",
    "google for",
    "search google",
    "current status",
    "recent update",
    "today's",
    "news about",
    "who is currently",
    "what happened today",
    "latest version",
    "release date of",
  ];
  return searchKeywords.some((keyword) => t.includes(keyword));
}
