// Usage accounting + cost-cap enforcement.
import { prisma } from "./prisma";

/** Start of the current billing period for a user's cap. */
function periodStart(capPeriod: string): Date {
  if (capPeriod === "TOTAL") return new Date(0); // since the beginning of time
  // MONTHLY: first day of the current month (UTC)
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface CapStatus {
  capUsd: number | null; // null = unlimited
  spentUsd: number;
  remainingUsd: number | null;
  exceeded: boolean;
  period: string;
}

/** Compute how much a user has spent in the active period and whether the cap is hit. */
export async function getCapStatus(userId: string): Promise<CapStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { costCapUsd: true, capPeriod: true },
  });
  if (!user) throw new Error("User not found");

  const since = periodStart(user.capPeriod);
  const agg = await prisma.usageRecord.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  const spentUsd = agg._sum.costUsd ?? 0;
  const capUsd = user.costCapUsd;

  return {
    capUsd,
    spentUsd,
    remainingUsd: capUsd === null ? null : Math.max(0, capUsd - spentUsd),
    exceeded: capUsd !== null && spentUsd >= capUsd,
    period: user.capPeriod,
  };
}

/** Write a usage record after a completed generation. */
export async function recordUsage(params: {
  userId: string;
  modelId?: string | null;
  apiKeyId?: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      userId: params.userId,
      modelId: params.modelId ?? null,
      apiKeyId: params.apiKeyId ?? null,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costUsd: params.costUsd,
    },
  });
}

/** Estimate USD cost from token counts using stored per-token prices. */
export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  promptPrice: number,
  completionPrice: number
): number {
  return promptTokens * promptPrice + completionTokens * completionPrice;
}
