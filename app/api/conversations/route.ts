import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse } from "@/lib/guard";

// List the current user's conversations (most recent first).
export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        modelId: true,
        updatedAt: true,
        model: { select: { displayName: true, modelId: true } },
      },
      take: 100,
    });
    return Response.json({ conversations });
  } catch (err) {
    return errorResponse(err);
  }
}

// Create an empty conversation (optional — the chat route auto-creates one too).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { title, modelId } = (await req.json()) as {
      title?: string;
      modelId?: string;
    };

    let dbModelId: string | undefined;
    if (modelId) {
      const model = await prisma.model.findUnique({ where: { modelId } });
      dbModelId = model?.id;
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: title?.slice(0, 60) || "New chat",
        modelId: dbModelId,
      },
    });
    return Response.json({ conversation }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
