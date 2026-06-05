import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, AuthError } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";
import { fetchProviderBalance } from "@/lib/provider-balance";

// Refresh a single key's balance from the provider's live API (admin only).
// Updates balanceUsd when the provider reports one; otherwise returns
// supported:false so the UI can explain it must be tracked manually.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new AuthError(404, "API key not found");

    const apiKey = decrypt(key.keyEncrypted);
    const result = await fetchProviderBalance(key.provider, apiKey, key.baseUrl);

    if (result.supported && result.balanceUsd !== null) {
      await prisma.apiKey.update({
        where: { id },
        data: { balanceUsd: result.balanceUsd },
      });
    }

    return Response.json({
      id,
      provider: key.provider,
      supported: result.supported,
      balanceUsd: result.balanceUsd,
      note: result.note,
      updated: result.supported && result.balanceUsd !== null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
