import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";

export const dynamic = "force-dynamic";

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  return text.trim() ? JSON.parse(text) : {};
}

// List the full model catalog (admin view).
export async function GET() {
  try {
    await requireAdmin();
    const models = await prisma.model.findMany({
      orderBy: [{ provider: "asc" }, { enabled: "desc" }, { tier: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        modelId: true,
        displayName: true,
        provider: true,
        tier: true,
        promptPrice: true,
        completionPrice: true,
        contextLength: true,
        custom: true,
        enabled: true,
        _count: { select: { users: true } },
      },
    });
    return Response.json({ models });
  } catch (err) {
    return errorResponse(err);
  }
}

// Add a custom model manually (admin). Useful for endpoints whose /models
// catalog is missing entries, or for a specific deployment like "gpt-5.4" on a
// custom OpenAI-compatible base URL.
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await readJsonBody(req)) as {
      modelId?: string;
      displayName?: string;
      provider?: string;
      tier?: string;
      promptPrice?: number;
      completionPrice?: number;
      contextLength?: number;
      enabled?: boolean;
    };

    const modelId = (body.modelId ?? "").trim();
    if (!modelId) throw new AuthError(400, "modelId is required (e.g. gpt-5.4)");

    const existing = await prisma.model.findUnique({ where: { modelId } });
    if (existing) throw new AuthError(409, `Model "${modelId}" already exists`);

    const tier = ["FREE", "ZERO_COST", "PAID"].includes(body.tier ?? "")
      ? (body.tier as string)
      : "PAID";

    const model = await prisma.model.create({
      data: {
        modelId,
        displayName: (body.displayName ?? "").trim() || modelId,
        provider: (body.provider ?? "custom").trim() || "custom",
        tier,
        promptPrice: Number(body.promptPrice) || 0,
        completionPrice: Number(body.completionPrice) || 0,
        contextLength: Number(body.contextLength) || 0,
        custom: true,
        enabled: body.enabled !== false,
      },
    });
    return Response.json({ model }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
