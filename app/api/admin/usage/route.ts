import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse } from "@/lib/guard";

// Per-user usage summary: token + cost totals, model breakdown.
export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, costCapUsd: true, capPeriod: true },
    });

    const byUser = await prisma.usageRecord.groupBy({
      by: ["userId"],
      _sum: { costUsd: true, promptTokens: true, completionTokens: true },
      _count: { _all: true },
    });

    const usageMap = new Map(byUser.map((u) => [u.userId, u]));

    const report = users.map((u) => {
      const agg = usageMap.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        name: u.name,
        costCapUsd: u.costCapUsd,
        capPeriod: u.capPeriod,
        totalCostUsd: agg?._sum.costUsd ?? 0,
        promptTokens: agg?._sum.promptTokens ?? 0,
        completionTokens: agg?._sum.completionTokens ?? 0,
        requests: agg?._count._all ?? 0,
      };
    });

    report.sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    const totals = report.reduce(
      (acc, r) => {
        acc.costUsd += r.totalCostUsd;
        acc.promptTokens += r.promptTokens;
        acc.completionTokens += r.completionTokens;
        acc.requests += r.requests;
        return acc;
      },
      { costUsd: 0, promptTokens: 0, completionTokens: 0, requests: 0 }
    );

    return Response.json({ report, totals });
  } catch (err) {
    return errorResponse(err);
  }
}
