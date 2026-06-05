import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { encrypt, maskKey } from "@/lib/crypto";
import { z } from "zod";

// List API keys with details (masked — never return plaintext or ciphertext).
export async function GET() {
  try {
    await requireAdmin();
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
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
    return Response.json({ keys });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  label: z.string().min(1),
  key: z.string().min(8),
  provider: z.string().default("openrouter"),
  baseUrl: z.string().url().optional().or(z.literal("")),
  creditUsd: z.number().positive().optional(),
  balanceUsd: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  costPerReq: z.number().positive().optional(),
  assignmentTier: z.enum(["FREE", "STANDARD", "PREMIUM"]).optional(),
  autoAssign: z.boolean().optional().default(false),
});

// Add a new API key (encrypted at rest).
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AuthError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { 
      label, 
      key, 
      provider, 
      baseUrl,
      creditUsd,
      balanceUsd,
      expiresAt,
      costPerReq,
      assignmentTier,
      autoAssign,
    } = parsed.data;

    const created = await prisma.apiKey.create({
      data: {
        label,
        provider,
        keyEncrypted: encrypt(key),
        baseUrl: baseUrl || null,
        creditUsd: creditUsd || null,
        balanceUsd: balanceUsd || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        costPerReq: costPerReq || null,
        assignmentTier: assignmentTier || null,
        autoAssign: autoAssign || false,
      },
      select: { 
        id: true, 
        label: true, 
        provider: true,
        creditUsd: true,
        balanceUsd: true,
        expiresAt: true,
        assignmentTier: true,
        autoAssign: true,
      },
    });

    return Response.json(
      { key: { ...created, masked: maskKey(key) } },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
