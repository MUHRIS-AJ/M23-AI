// Server-side guards for API routes and server components.
import { auth } from "@/auth";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Require any logged-in user. Throws AuthError(401) otherwise. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError(401, "Not authenticated");
  }
  return session.user;
}

/** Require an ADMIN user. Throws AuthError(401/403) otherwise. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AuthError(403, "Admin access required");
  }
  return user;
}

/** Convert a thrown AuthError (or anything) into a JSON Response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[api error]", err);
  return Response.json({ error: message }, { status: 500 });
}
