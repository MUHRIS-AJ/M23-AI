// Route protection via Auth.js. Runs on the edge — uses the DB-free authConfig.
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protect pages only. API routes enforce their own auth via lib/guard.ts
  // (requireUser/requireAdmin) so they return clean 401/403 JSON instead of
  // a 307 redirect to the login HTML — which would break client fetch().
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
