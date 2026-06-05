import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { z } from "zod";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  transport: z.enum(["sse", "http"]).optional(),
  headersJson: z.string().nullable().optional(),
});

// Update an MCP server (toggle enabled, edit fields).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    if (parsed.data.headersJson) {
      try {
        JSON.parse(parsed.data.headersJson);
      } catch {
        throw new AuthError(400, "Headers must be valid JSON");
      }
    }
    const server = await prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new AuthError(404, "MCP server not found");

    await prisma.mcpServer.update({ where: { id }, data: parsed.data });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete an MCP server (admin only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const server = await prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new AuthError(404, "MCP server not found");
    await prisma.mcpServer.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
