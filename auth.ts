// Full Auth.js setup (Node runtime). Credentials provider with bcrypt + Prisma.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/prisma";
import { autoAssignApiKeysToUser, assignBestKeyForUser } from "./lib/key-assignment";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Called on every sign-in attempt. For Google: create user if new.
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;

        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (!dbUser) {
          // Auto-create new user from Google sign-in
          dbUser = await prisma.user.create({
            data: {
              email,
              name: user.name || email.split("@")[0],
              role: "MEMBER",
              capPeriod: "MONTHLY",
            },
          });

          // Auto-assign API keys to the new user
          try {
            await autoAssignApiKeysToUser(dbUser.id, "FREE");
            const hasKeys = await prisma.userApiKey.count({
              where: { userId: dbUser.id },
            });
            if (hasKeys === 0) {
              await assignBestKeyForUser(dbUser.id);
            }
          } catch (e) {
            console.warn(`Failed to auto-assign keys for Google user ${dbUser.id}:`, e);
          }
        }
      }
      return true;
    },

    // Persist id + role onto the JWT at sign-in.
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          // Look up the DB user to get the Mongo ObjectId + role
          const email = user.email?.toLowerCase();
          if (email) {
            const dbUser = await prisma.user.findUnique({ where: { email } });
            if (dbUser) {
              token.id = dbUser.id;
              token.role = dbUser.role;
            }
          }
        } else {
          token.id = user.id;
          token.role = user.role;
        }
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
  },
});
