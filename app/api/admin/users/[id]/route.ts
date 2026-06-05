import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Fetch a single user with full allocations (admin only).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        costCapUsd: true,
        capPeriod: true,
        apiKeys: { select: { apiKeyId: true } },
        models: { select: { modelId: true } },
      },
    });
    if (!user) throw new AuthError(404, "User not found");
    return Response.json({
      user: {
        ...user,
        apiKeyIds: user.apiKeys.map((a) => a.apiKeyId),
        modelIds: user.models.map((m) => m.modelId),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const updateSchema = z.object({
  name: z.string().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  costCapUsd: z.number().nonnegative().nullable().optional(),
  capPeriod: z.enum(["MONTHLY", "TOTAL"]).optional(),
  apiKeyIds: z.array(z.string()).optional(), // full replacement of allocations
  modelIds: z.array(z.string()).optional(), // full replacement of allocations
});

// Update a user: profile, cap, password, and (re)allocate keys/models.
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
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AuthError(404, "User not found");

    await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        costCapUsd: data.costCapUsd === undefined ? undefined : data.costCapUsd,
        capPeriod: data.capPeriod,
        ...(data.password
          ? { passwordHash: await bcrypt.hash(data.password, 12) }
          : {}),
      },
    });

    // Replace API key allocations if provided.
    if (data.apiKeyIds) {
      await prisma.userApiKey.deleteMany({ where: { userId: id } });
      if (data.apiKeyIds.length > 0) {
        await prisma.userApiKey.createMany({
          data: data.apiKeyIds.map((apiKeyId) => ({ userId: id, apiKeyId })),
        });
      }
    }

    // Replace model allocations if provided.
    if (data.modelIds) {
      await prisma.userModel.deleteMany({ where: { userId: id } });
      if (data.modelIds.length > 0) {
        await prisma.userModel.createMany({
          data: data.modelIds.map((modelId) => ({ userId: id, modelId })),
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete a user (admin only). Guards against deleting the last admin.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.id) {
      throw new AuthError(400, "You cannot delete your own account");
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new AuthError(404, "User not found");
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) throw new AuthError(400, "Cannot delete the last admin");
    }
    await prisma.user.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
