// Seed script: creates the first ADMIN user from env vars and example API keys.
// Run with: npm run db:seed   (or automatically via `prisma migrate dev`)
import { PrismaClient } from "@prisma/client";
import { encrypt } from "@/lib/crypto";
import bcrypt from "bcryptjs";
import { FREE_MODELS } from "@/lib/auto-model";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const name = process.env.ADMIN_NAME ?? "Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Admin already exists: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "ADMIN",
        costCapUsd: null, // admin has no cap
        capPeriod: "MONTHLY",
      },
    });

    console.log(`✓ Created admin user: ${admin.email}`);
    console.log(`  Password: ${password}  (change it after first login)`);
  }

  // Create example API keys for testing
  const keys = [
    {
      label: "OpenRouter - FREE Tier",
      provider: "openrouter",
      keyEncrypted: encrypt("sk-or-demo-free-key-12345"),
      creditUsd: 50,
      balanceUsd: 45.23,
      costPerReq: 0.0005,
      assignmentTier: "FREE",
      autoAssign: true,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    },
    {
      label: "OpenRouter - STANDARD Tier",
      provider: "openrouter",
      keyEncrypted: encrypt("sk-or-demo-standard-key-12345"),
      creditUsd: 500,
      balanceUsd: 320.50,
      costPerReq: 0.005,
      assignmentTier: "STANDARD",
      autoAssign: true,
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days from now
    },
    {
      label: "OpenRouter - PREMIUM Tier",
      provider: "openrouter",
      keyEncrypted: encrypt("sk-or-demo-premium-key-12345"),
      creditUsd: 2000,
      balanceUsd: 1850.75,
      costPerReq: 0.02,
      assignmentTier: "PREMIUM",
      autoAssign: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    },
  ];

  for (const key of keys) {
    const existing = await prisma.apiKey.findFirst({
      where: { label: key.label },
    });

    if (!existing) {
      await prisma.apiKey.create({
        data: key,
      });
      console.log(`✓ Created demo API key: ${key.label}`);
    } else {
      console.log(`✓ Demo API key already exists: ${key.label}`);
    }
  }

  // Create free models
  console.log("Seeding free models...");
  for (const free of FREE_MODELS) {
    const existingModel = await prisma.model.findUnique({
      where: { modelId: free.modelId },
    });

    if (!existingModel) {
      await prisma.model.create({
        data: {
          modelId: free.modelId,
          displayName: free.displayName,
          provider: "openrouter",
          tier: "FREE",
          promptPrice: free.promptPrice,
          completionPrice: free.completionPrice,
          contextLength: free.contextLength,
          custom: false,
          enabled: true,
        },
      });
      console.log(`✓ Seeded free model: ${free.displayName}`);
    } else {
      console.log(`✓ Free model already exists: ${free.displayName}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
