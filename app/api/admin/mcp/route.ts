import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { z } from "zod";

// List registered MCP servers (admin only).
export async function GET() {
  try {
    await requireAdmin();
    const servers = await prisma.mcpServer.findMany({
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ servers });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  transport: z.enum(["sse", "http"]).default("sse"),
  headersJson: z.string().optional(),
  enabled: z.boolean().default(true),
});

// Register a new MCP server (admin only).
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const data = parsed.data;

    // Validate optional headers JSON early so bad input is rejected here.
    if (data.headersJson) {
      try {
        JSON.parse(data.headersJson);
      } catch {
        throw new AuthError(400, "Headers must be valid JSON");
      }
    }

    const server = await prisma.mcpServer.create({
      data: {
        name: data.name,
        url: data.url,
        transport: data.transport,
        headersJson: data.headersJson || null,
        enabled: data.enabled,
      },
    });
    return Response.json({ server }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
