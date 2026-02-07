import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { rateLimit } from "./rate-limit";

export type Role = "OWNER" | "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";

const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Refresh role from DB every 5 minutes

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Rate limit: max 5 attempts per email per 15 minutes
        const rl = rateLimit(`login:${email.toLowerCase()}`, 5, 15 * 60 * 1000);
        if (!rl.success) {
          return null; // silently reject — don't reveal rate limiting
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive || user.deletedAt) {
          return null;
        }

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Run the base jwt callback (sets initial token fields)
      const baseToken = await authConfig.callbacks.jwt({ token, user } as Parameters<NonNullable<typeof authConfig.callbacks.jwt>>[0]);

      // Periodically refresh role from DB to prevent stale JWT roles
      // This only runs in Node.js runtime (server actions, API routes), not in Edge middleware
      const lastRefresh = (baseToken as { roleRefreshedAt?: number }).roleRefreshedAt ?? 0;
      if (Date.now() - lastRefresh > ROLE_REFRESH_INTERVAL_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: baseToken.id },
            select: { role: true, firstName: true, lastName: true },
          });
          if (dbUser) {
            baseToken.role = dbUser.role as Role;
            baseToken.firstName = dbUser.firstName;
            baseToken.lastName = dbUser.lastName;
          }
          (baseToken as { roleRefreshedAt?: number }).roleRefreshedAt = Date.now();
        } catch {
          // DB error — keep existing token values, try again next time
        }
      }

      return baseToken;
    },
  },
});

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export async function getCurrentUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  return session.user as SessionUser;
}
