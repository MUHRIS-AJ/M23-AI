import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { autoAssignApiKeysToUser, assignBestKeyForUser } from "@/lib/key-assignment";
import bcrypt from "bcryptjs";
import { z } from "zod";

// List all users with their allocation counts + current-period spend.
export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        costCapUsd: true,
        capPeriod: true,
        createdAt: true,
        _count: { select: { apiKeys: true, models: true } },
      },
    });
    return Response.json({ users });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  costCapUsd: z.number().nonnegative().nullable().optional(),
  capPeriod: z.enum(["MONTHLY", "TOTAL"]).default("MONTHLY"),
  apiKeyIds: z.array(z.string()).optional(),
  modelIds: z.array(z.string()).optional(),
  userTier: z.enum(["FREE", "STANDARD", "PREMIUM"]).optional(),
  autoAssignKeys: z.boolean().default(true), // Auto-assign keys based on tier
});

// Create a new team member (admin only).
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const data = parsed.data;
    const email = data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AuthError(409, "A user with that email already exists");

    const passwordHash = await bcrypt.hash(data.password, 12);
    const freeModelIds = data.modelIds?.length
      ? (
          await prisma.model.findMany({
            where: {
              id: { in: data.modelIds },
              tier: { in: ["FREE", "ZERO_COST"] },
            },
            select: { id: true },
          })
        ).map((model) => model.id)
      : [];
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: data.name,
        role: data.role,
        costCapUsd: data.costCapUsd ?? null,
        capPeriod: data.capPeriod,
        apiKeys: data.apiKeyIds
          ? { create: data.apiKeyIds.map((apiKeyId) => ({ apiKeyId })) }
          : undefined,
        models: freeModelIds.length
          ? { create: freeModelIds.map((modelId) => ({ modelId })) }
          : undefined,
      },
      select: { id: true, email: true },
    });

    // Auto-assign API keys if requested
    if (data.autoAssignKeys) {
      try {
        // If no explicit tier provided, determine from cost cap
        const tier = data.userTier || (
          !data.costCapUsd || data.costCapUsd < 10
            ? "FREE"
            : data.costCapUsd >= 100
            ? "PREMIUM"
            : "STANDARD"
        );
        
        // Try auto-assignment first
        await autoAssignApiKeysToUser(user.id, tier);
        
        // If no keys found, try to assign the best available key
        const hasKeys = await prisma.userApiKey.count({
          where: { userId: user.id },
        });
        if (hasKeys === 0) {
          await assignBestKeyForUser(user.id);
        }
      } catch (e) {
        // Log but don't fail the user creation
        console.warn(`Failed to auto-assign keys for user ${user.id}:`, e);
      }
    }

    return Response.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
