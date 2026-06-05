import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { z } from "zod";

// Get details of a specific API key
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const key = await prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        provider: true,
        baseUrl: true,
        creditUsd: true,
        balanceUsd: true,
        expiresAt: true,
        costPerReq: true,
        assignmentTier: true,
        autoAssign: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { users: true } },
      },
    });
    if (!key) throw new AuthError(404, "API key not found");
    return Response.json({ key });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  creditUsd: z.number().positive().optional(),
  balanceUsd: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  costPerReq: z.number().positive().optional(),
  assignmentTier: z.enum(["FREE", "STANDARD", "PREMIUM"]).optional().nullable(),
  autoAssign: z.boolean().optional(),
});

// Update API key provider details
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new AuthError(404, "API key not found");

    const updateData: any = {};
    if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
    if (parsed.data.creditUsd !== undefined) updateData.creditUsd = parsed.data.creditUsd;
    if (parsed.data.balanceUsd !== undefined) updateData.balanceUsd = parsed.data.balanceUsd;
    if (parsed.data.expiresAt !== undefined) updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    if (parsed.data.costPerReq !== undefined) updateData.costPerReq = parsed.data.costPerReq;
    if (parsed.data.assignmentTier !== undefined) updateData.assignmentTier = parsed.data.assignmentTier;
    if (parsed.data.autoAssign !== undefined) updateData.autoAssign = parsed.data.autoAssign;

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        label: true,
        provider: true,
        creditUsd: true,
        balanceUsd: true,
        expiresAt: true,
        costPerReq: true,
        assignmentTier: true,
        autoAssign: true,
      },
    });

    return Response.json({ key: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete an API key (admin only). Cascades to allocations + nulls usage refs.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new AuthError(404, "API key not found");
    await prisma.apiKey.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
