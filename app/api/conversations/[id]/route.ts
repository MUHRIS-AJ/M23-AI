import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";

// Fetch a single conversation with its messages (ownership-checked).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        model: { select: { modelId: true, displayName: true } },
      },
    });

    if (!conversation || conversation.userId !== user.id) {
      throw new AuthError(404, "Conversation not found");
    }

    return Response.json({ conversation });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete a conversation (ownership-checked).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation || conversation.userId !== user.id) {
      throw new AuthError(404, "Conversation not found");
    }

    await prisma.conversation.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
