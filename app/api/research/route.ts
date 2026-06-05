import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";
import { getOpenRouterProvider } from "@/lib/openrouter";
import { getCapStatus, recordUsage, estimateCost } from "@/lib/usage";
import { runResearch } from "@/lib/research";

export const maxDuration = 300;

interface ResearchBody {
  question: string;
  model: string; // base OpenRouter modelId
  conversationId?: string;
  maxSubQuestions?: number;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ResearchBody;
    const question = (body.question ?? "").trim();
    const modelId = body.model;
    let conversationId = body.conversationId;

    if (!question) throw new AuthError(400, "No question provided");
    if (!modelId) throw new AuthError(400, "No model selected");

    // ── Model + allocation checks (same as chat) ──────────────
    const model = await prisma.model.findUnique({ where: { modelId } });
    if (!model || !model.enabled) throw new AuthError(400, "Model is not available");

    const allowed = await prisma.userModel.findUnique({
      where: { userId_modelId: { userId: user.id, modelId: model.id } },
    });
    if (!allowed && user.role !== "ADMIN") {
      throw new AuthError(403, "You are not allocated this model");
    }

    // Research is multi-call and web-enabled → always treat as paid for caps.
    const cap = await getCapStatus(user.id);
    if (cap.exceeded) {
      throw new AuthError(
        402,
        `Budget limit reached (${cap.spentUsd.toFixed(4)} / ${cap.capUsd?.toFixed(
          2
        )} USD this ${cap.period.toLowerCase()}). Contact your admin.`
      );
    }

    // ── Resolve OpenRouter key (research needs :online web search) ─
    const userKey = await prisma.userApiKey.findFirst({
      where: { userId: user.id, apiKey: { provider: "openrouter" } },
      include: { apiKey: true },
    });
    const apiKeyRow =
      userKey?.apiKey ??
      (user.role === "ADMIN"
        ? await prisma.apiKey.findFirst({ where: { provider: "openrouter" } })
        : null);
    if (!apiKeyRow) {
      throw new AuthError(403, "Deep research needs an OpenRouter key. Contact your admin.");
    }

    const apiKey = decrypt(apiKeyRow.keyEncrypted);
    const provider = getOpenRouterProvider(apiKey, apiKeyRow.baseUrl ?? undefined);

    // ── Run the agent ─────────────────────────────────────────
    const result = await runResearch({
      provider: (m: string) => provider(m),
      model: modelId,
      question,
      maxSubQuestions: Math.min(Math.max(body.maxSubQuestions ?? 4, 2), 6),
    });

    // ── Record usage across all internal calls ────────────────
    const costUsd = estimateCost(
      result.usage.promptTokens,
      result.usage.completionTokens,
      model.promptPrice,
      model.completionPrice
    );
    await recordUsage({
      userId: user.id,
      modelId: model.id,
      apiKeyId: apiKeyRow.id,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costUsd,
    });

    // ── Persist as a conversation (user question + report) ────
    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: {
          userId: user.id,
          modelId: model.id,
          title: question.length > 48 ? `${question.slice(0, 48)}…` : question,
        },
      });
      conversationId = created.id;
    }
    await prisma.message.create({
      data: { conversationId, role: "user", content: question },
    });
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: result.report,
        tokens: result.usage.completionTokens,
        costUsd,
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return Response.json(
      {
        conversationId,
        report: result.report,
        subQuestions: result.subQuestions,
        steps: result.steps,
        costUsd,
      },
      { headers: { "x-conversation-id": conversationId } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
