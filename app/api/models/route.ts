import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse } from "@/lib/guard";
import { AUTO_MODEL_ID, FREE_MODELS } from "@/lib/auto-model";
import { resolveAllProviderKeys } from "@/lib/provider-keys";

// Returns the models the current user is allowed to use, shaped for the
// chat input's ModelSelector. Admins see all enabled models.
export async function GET() {
  try {
    const user = await requireUser();
    const keys = await resolveAllProviderKeys(user.id, user.role);
    const allowedProviders = new Set(keys.map((key) => key.provider));

    // Always allow openrouter to support built-in free models
    allowedProviders.add("openrouter");

    const models = await prisma.model.findMany({
      where: {
        enabled: true,
        provider: { in: [...allowedProviders] },
        OR: [
          { tier: { in: ["FREE", "ZERO_COST"] } },
          ...(user.role === "ADMIN"
            ? [{}]
            : [{ users: { some: { userId: user.id } } }]),
        ],
      },
      orderBy: [{ tier: "asc" }, { displayName: "asc" }],
    });

    const badgeFor = (tier: string) =>
      tier === "FREE" ? "Free" : tier === "ZERO_COST" ? "$0" : undefined;

    const shaped = models.map((m) => ({
      id: m.modelId,
      name: m.displayName,
      description:
        m.tier === "PAID"
          ? `Paid · ${m.contextLength.toLocaleString()} ctx`
          : m.tier === "ZERO_COST"
          ? `Zero cost · ${m.contextLength.toLocaleString()} ctx`
          : `Free · ${m.contextLength.toLocaleString()} ctx`,
      badge: badgeFor(m.tier),
      tier: m.tier,
    }));

    // Ensure built-in free models are always in the list if not already present from DB
    const existingModelIds = new Set(shaped.map((s) => s.id));
    for (const free of FREE_MODELS) {
      if (!existingModelIds.has(free.modelId)) {
        shaped.push({
          id: free.modelId,
          name: free.displayName,
          description: `Free · ${free.contextLength.toLocaleString()} ctx`,
          badge: "Free",
          tier: free.tier,
        });
      }
    }

    // Always surface an "Auto" option at the top. It routes each message
    // to the best-fit model automatically.
    const withAuto = [
      {
        id: AUTO_MODEL_ID,
        name: "Auto",
        description: "Picks the best model for each message",
        badge: "Smart",
        tier: "AUTO",
      },
      ...shaped,
    ];

    return Response.json({ models: withAuto });
  } catch (err) {
    return errorResponse(err);
  }
}
