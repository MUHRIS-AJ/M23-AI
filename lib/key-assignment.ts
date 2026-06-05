// Automatic API key assignment logic based on user tier and provider availability
import { prisma } from "./prisma";

export interface AssignmentStrategy {
  tier: string; // "FREE" | "STANDARD" | "PREMIUM"
  costThreshold: number; // Max cost per request for this tier
  minBalance: number; // Minimum balance to consider key available
}

// Define tier strategies
const TIER_STRATEGIES: Record<string, AssignmentStrategy> = {
  FREE: {
    tier: "FREE",
    costThreshold: 0.001, // $0.001 per request max
    minBalance: 5, // $5 min balance
  },
  STANDARD: {
    tier: "STANDARD",
    costThreshold: 0.01, // $0.01 per request max
    minBalance: 50, // $50 min balance
  },
  PREMIUM: {
    tier: "PREMIUM",
    costThreshold: Infinity, // No limit
    minBalance: 100, // $100 min balance
  },
};

/**
 * Auto-assign API keys to a user based on their tier.
 * Selects keys marked with auto-assignment and matching the tier.
 */
export async function autoAssignApiKeysToUser(
  userId: string,
  userTier: string = "STANDARD"
): Promise<void> {
  const strategy = TIER_STRATEGIES[userTier] || TIER_STRATEGIES.STANDARD;

  // Find API keys marked for auto-assignment to this tier
  const availableKeys = await prisma.apiKey.findMany({
    where: {
      autoAssign: true,
      assignmentTier: userTier,
      // Only select keys with sufficient balance and not expired
      balanceUsd: {
        gte: strategy.minBalance,
      },
      OR: [
        { expiresAt: null }, // No expiration
        { expiresAt: { gt: new Date() } }, // Not expired
      ],
    },
    orderBy: [
      // Prefer keys with higher balance
      { balanceUsd: "desc" },
      { createdAt: "desc" },
    ],
  });

  if (availableKeys.length === 0) {
    console.warn(
      `No auto-assign keys available for user ${userId} tier ${userTier}`
    );
    return;
  }

  // Assign the best available key
  const selectedKey = availableKeys[0];

  // Check if user already has this key
  const existing = await prisma.userApiKey.findUnique({
    where: {
      userId_apiKeyId: {
        userId,
        apiKeyId: selectedKey.id,
      },
    },
  });

  if (!existing) {
    await prisma.userApiKey.create({
      data: {
        userId,
        apiKeyId: selectedKey.id,
      },
    });
  }
}

/**
 * Assign best available key to a user based on their cost needs
 */
export async function assignBestKeyForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { costCapUsd: true },
  });

  if (!user) throw new Error("User not found");

  // Determine tier based on cost cap
  let tier = "STANDARD";
  if (!user.costCapUsd || user.costCapUsd < 10) {
    tier = "FREE";
  } else if (user.costCapUsd >= 100) {
    tier = "PREMIUM";
  }

  await autoAssignApiKeysToUser(userId, tier);
}

/**
 * Get assignment statistics for all keys
 */
export async function getKeyAssignmentStats() {
  const stats = await prisma.apiKey.findMany({
    select: {
      id: true,
      label: true,
      provider: true,
      assignmentTier: true,
      balanceUsd: true,
      expiresAt: true,
      costPerReq: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return stats;
}

/**
 * Deactivate low-balance keys for a tier
 */
export async function deactivateLowBalanceKeys(): Promise<number> {
  const tiersWithMinBalance = Object.entries(TIER_STRATEGIES).map(
    ([tier, strategy]) => ({
      tier,
      minBalance: strategy.minBalance,
    })
  );

  let deactivatedCount = 0;

  for (const { tier, minBalance } of tiersWithMinBalance) {
    const result = await prisma.apiKey.updateMany({
      where: {
        assignmentTier: tier,
        autoAssign: true,
        balanceUsd: {
          lt: minBalance,
        },
      },
      data: {
        autoAssign: false,
      },
    });

    deactivatedCount += result.count;
  }

  return deactivatedCount;
}
