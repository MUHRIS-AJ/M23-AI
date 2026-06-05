import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse, AuthError } from "@/lib/guard";

// List the skills available to the current user: their own private skills plus
// any GLOBAL skills published by an admin. Used by the Skills tab and the chat
// composer's skill picker.
export async function GET() {
  try {
    const user = await requireUser();
    const skills = await prisma.skill.findMany({
      where: {
        OR: [{ userId: user.id }, { scope: "GLOBAL", userId: null }],
      },
      orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        emoji: true,
        instructions: true,
        webAccess: true,
        scope: true,
        enabled: true,
        userId: true,
        updatedAt: true,
      },
    });
    // Mark which skills the user owns (editable) vs. read-only globals.
    const shaped = skills.map((s) => ({
      ...s,
      owned: s.userId === user.id,
    }));
    return Response.json({ skills: shaped });
  } catch (err) {
    return errorResponse(err);
  }
}

// Create a new private skill owned by the current user. Admins may publish a
// GLOBAL skill (userId null) by passing scope: "GLOBAL".
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      emoji?: string;
      instructions?: string;
      webAccess?: boolean;
      scope?: string;
    };

    const name = (body.name ?? "").trim();
    const instructions = (body.instructions ?? "").trim();
    if (!name) throw new AuthError(400, "Skill name is required");
    if (!instructions) throw new AuthError(400, "Skill instructions are required");

    const wantsGlobal = body.scope === "GLOBAL";
    if (wantsGlobal && user.role !== "ADMIN") {
      throw new AuthError(403, "Only admins can publish global skills");
    }

    const skill = await prisma.skill.create({
      data: {
        userId: wantsGlobal ? null : user.id,
        scope: wantsGlobal ? "GLOBAL" : "PRIVATE",
        name: name.slice(0, 80),
        description: (body.description ?? "").trim().slice(0, 280),
        emoji: (body.emoji ?? "✨").slice(0, 8) || "✨",
        instructions: instructions.slice(0, 8000),
        webAccess: Boolean(body.webAccess),
        enabled: true,
      },
    });
    return Response.json({ skill }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
