import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { autoAssignApiKeysToUser, assignBestKeyForUser } from "@/lib/key-assignment";

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required").max(100),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { email: rawEmail, password, name } = parsed.data;
    const email = rawEmail.toLowerCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "MEMBER",
        capPeriod: "MONTHLY",
      },
    });

    // Auto-assign API keys to the new user
    try {
      await autoAssignApiKeysToUser(user.id, "FREE");
      const hasKeys = await prisma.userApiKey.count({
        where: { userId: user.id },
      });
      if (hasKeys === 0) {
        await assignBestKeyForUser(user.id);
      }
    } catch (e) {
      console.warn(`Failed to auto-assign keys for new user ${user.id}:`, e);
    }

    return Response.json(
      { user: { id: user.id, email: user.email, name: user.name } },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[signup error]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
