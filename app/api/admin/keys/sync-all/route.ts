import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";
import { fetchProviderBalance } from "@/lib/provider-balance";

// Refresh balances for ALL keys that support live lookup (admin only).
// Returns a per-key result so the UI can show what synced vs. stayed manual.
export async function POST() {
  try {
    await requireAdmin();

    const keys = await prisma.apiKey.findMany();

    const results = await Promise.all(
      keys.map(async (key) => {
        try {
          const apiKey = decrypt(key.keyEncrypted);
          const result = await fetchProviderBalance(key.provider, apiKey, key.baseUrl);
          if (result.supported && result.balanceUsd !== null) {
            await prisma.apiKey.update({
              where: { id: key.id },
              data: { balanceUsd: result.balanceUsd },
            });
          }
          return {
            id: key.id,
            label: key.label,
            provider: key.provider,
            supported: result.supported,
            balanceUsd: result.balanceUsd,
            updated: result.supported && result.balanceUsd !== null,
            note: result.note,
          };
        } catch {
          return {
            id: key.id,
            label: key.label,
            provider: key.provider,
            supported: false,
            balanceUsd: null,
            updated: false,
            note: "Lookup failed.",
          };
        }
      })
    );

    const updated = results.filter((r) => r.updated).length;
    return Response.json({ results, updated, total: keys.length });
  } catch (err) {
    return errorResponse(err);
  }
}
