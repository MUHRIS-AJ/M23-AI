// Edge-safe Auth.js config: callbacks + route guard only, NO Prisma/bcrypt imports.
// Used by middleware (edge runtime) and spread into the full config in auth.ts.
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [], // real providers added in auth.ts (Node runtime)
  callbacks: {
    // Persist id + role onto the JWT at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // Expose id + role on the session for client + server checks.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    // Route guard used by middleware. Return true to allow, false to redirect to signIn.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Public paths
      if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/chat", nextUrl));
        }
        return true;
      }

      // Everything else requires login
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
