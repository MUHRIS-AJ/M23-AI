import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";
import { fetchProviderModels } from "@/lib/providers";
import { z } from "zod";

const bodySchema = z.object({
  apiKeyId: z.string().optional(), // sync just this key; omit to sync ALL keys
});

interface SyncReport {
  provider: string;
  keyLabel: string;
  total: number;
  created: number;
  updated: number;
  error?: string;
}

// Sync the model catalog from one or ALL provider API keys.
// - With `apiKeyId`: sync only that key's provider.
// - Without: iterate every API key and sync each provider's catalog.
// Models are tagged with their provider so chat can route correctly. Existing
// tier overrides and custom (manually-added) models are preserved.
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { apiKeyId } = bodySchema.parse(await req.json().catch(() => ({})));

    const keys = apiKeyId
      ? await prisma.apiKey.findMany({ where: { id: apiKeyId } })
      : await prisma.apiKey.findMany();

    if (keys.length === 0) {
      throw new AuthError(400, "No API keys found. Add a provider key first.");
    }

    // De-dupe by provider: one key per provider is enough to fetch its catalog.
    // Prefer the first key we see for each provider.
    const seenProviders = new Set<string>();
    const reports: SyncReport[] = [];
    let grandTotal = 0;
    let grandCreated = 0;
    let grandUpdated = 0;

    for (const keyRow of keys) {
      if (!apiKeyId && seenProviders.has(keyRow.provider)) continue;
      seenProviders.add(keyRow.provider);

      const report: SyncReport = {
        provider: keyRow.provider,
        keyLabel: keyRow.label,
        total: 0,
        created: 0,
        updated: 0,
      };

      try {
        const apiKey = decrypt(keyRow.keyEncrypted);
        const models = await fetchProviderModels(
          keyRow.provider,
          apiKey,
          keyRow.baseUrl
        );
        report.total = models.length;

        for (const m of models) {
          const existing = await prisma.model.findUnique({
            where: { modelId: m.modelId },
          });
          if (existing) {
            await prisma.model.update({
              where: { modelId: m.modelId },
              data: {
                displayName: m.displayName,
                provider: keyRow.provider,
                promptPrice: m.promptPrice,
                completionPrice: m.completionPrice,
                contextLength: m.contextLength,
                tier: existing.tier, // keep admin's manual tier override
              },
            });
            report.updated++;
          } else {
            await prisma.model.create({
              data: {
                modelId: m.modelId,
                displayName: m.displayName,
                provider: keyRow.provider,
                tier: m.tier,
                promptPrice: m.promptPrice,
                completionPrice: m.completionPrice,
                contextLength: m.contextLength,
                enabled: m.tier === "FREE", // free enabled by default; paid opt-in
              },
            });
            report.created++;
          }
        }
      } catch (err) {
        report.error = (err as Error).message;
      }

      grandTotal += report.total;
      grandCreated += report.created;
      grandUpdated += report.updated;
      reports.push(report);
    }

    return Response.json({
      ok: true,
      total: grandTotal,
      created: grandCreated,
      updated: grandUpdated,
      providers: reports,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
