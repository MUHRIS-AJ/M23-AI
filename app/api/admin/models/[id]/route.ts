import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  return text.trim() ? JSON.parse(text) : {};
}

const patchSchema = z.object({
  tier: z.enum(["FREE", "ZERO_COST", "PAID"]).optional(),
  enabled: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
});

// Edit a model: change tier, enable/disable, or rename (admin only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const model = await prisma.model.findUnique({ where: { id } });
    if (!model) throw new AuthError(404, "Model not found");

    await prisma.model.update({ where: { id }, data: parsed.data });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete a model from the catalog (admin only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const model = await prisma.model.findUnique({ where: { id } });
    if (!model) throw new AuthError(404, "Model not found");
    await prisma.model.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
