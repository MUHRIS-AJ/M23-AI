import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";

// Update a skill the user owns (or any skill if admin). Only the owner or an
// admin may edit; globals are admin-only.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.skill.findUnique({ where: { id } });
    if (!existing) throw new AuthError(404, "Skill not found");

    const isOwner = existing.userId === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new AuthError(403, "You cannot edit this skill");

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      emoji?: string;
      instructions?: string;
      webAccess?: boolean;
      enabled?: boolean;
    };

    const data: Record<string, unknown> = {};
    if ("name" in body && body.name?.trim()) data.name = body.name.trim().slice(0, 80);
    if ("description" in body)
      data.description = (body.description ?? "").trim().slice(0, 280);
    if ("emoji" in body) data.emoji = (body.emoji ?? "✨").slice(0, 8) || "✨";
    if ("instructions" in body && body.instructions?.trim())
      data.instructions = body.instructions.trim().slice(0, 8000);
    if ("webAccess" in body) data.webAccess = Boolean(body.webAccess);
    if ("enabled" in body) data.enabled = Boolean(body.enabled);

    const skill = await prisma.skill.update({ where: { id }, data });
    return Response.json({ skill });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete a skill the user owns (or any skill if admin).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.skill.findUnique({ where: { id } });
    if (!existing) throw new AuthError(404, "Skill not found");

    const isOwner = existing.userId === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new AuthError(403, "You cannot delete this skill");

    await prisma.skill.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
