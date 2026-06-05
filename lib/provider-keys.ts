// Shared API-key resolution for non-chat features (image gen, speech).
// Mirrors the chat route's pattern: prefer a key the user is allocated, then
// fall back to any admin-owned key of the right provider.
import { prisma } from "./prisma";
import { decrypt } from "./crypto";

export interface ResolvedKey {
  id: string;
  provider: string;
  apiKey: string; // decrypted plaintext — never persist or log
  baseUrl: string | null;
}

/**
 * Resolve a usable API key for one of `providers` (checked in order).
 * @param userId  current user id
 * @param role    "ADMIN" may fall back to any key of the provider
 * @param providers ordered provider preference, e.g. ["openai","custom"]
 * @returns the first match (decrypted) or null if none is available
 */
export async function resolveProviderKey(
  userId: string,
  role: string | undefined,
  providers: string[]
): Promise<ResolvedKey | null> {
  const keys = await resolveProviderKeys(userId, role, providers);
  return keys[0] ?? null;
}

/** Resolve every usable key for the requested providers, in preference order. */
export async function resolveProviderKeys(
  userId: string,
  role: string | undefined,
  providers: string[]
): Promise<ResolvedKey[]> {
  const resolved: ResolvedKey[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    // 1. A key explicitly allocated to this user.
    const userKey = await prisma.userApiKey.findFirst({
      where: { userId, apiKey: { provider } },
      include: { apiKey: true },
    });
    let row = userKey?.apiKey ?? null;

    // 2. Admins may borrow any key of this provider.
    if (!row && role === "ADMIN") {
      row = await prisma.apiKey.findFirst({ where: { provider } });
    }

    if (row) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      resolved.push({
        id: row.id,
        provider: row.provider,
        apiKey: decrypt(row.keyEncrypted),
        baseUrl: row.baseUrl,
      });
    }
  }

  return resolved;
}

/** Resolve every usable key the user can access, regardless of provider. */
export async function resolveAllProviderKeys(
  userId: string,
  role: string | undefined
): Promise<ResolvedKey[]> {
  const keys = await prisma.apiKey.findMany({ orderBy: [{ provider: "asc" }, { label: "asc" }] });
  const resolved: ResolvedKey[] = [];

  for (const row of keys) {
    const allocated = await prisma.userApiKey.findFirst({
      where: { userId, apiKeyId: row.id },
      include: { apiKey: true },
    });
    const isAdminFallback = role === "ADMIN";
    if (!allocated && !isAdminFallback) continue;

    resolved.push({
      id: row.id,
      provider: row.provider,
      apiKey: decrypt(row.keyEncrypted),
      baseUrl: row.baseUrl,
    });
  }

  return resolved;
}
