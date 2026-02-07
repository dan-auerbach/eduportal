import type { NextAuthConfig } from "next-auth";

export type Role = "OWNER" | "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    firstName: string;
    lastName: string;
    roleRefreshedAt?: number;
  }
}

const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Refresh role from DB every 5 minutes

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/auth/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role: Role }).role;
        token.firstName = (user as { firstName: string }).firstName;
        token.lastName = (user as { lastName: string }).lastName;
        token.roleRefreshedAt = Date.now();
      }

      // Periodically refresh role from DB to prevent stale JWT roles
      const lastRefresh = token.roleRefreshedAt ?? 0;
      if (Date.now() - lastRefresh > ROLE_REFRESH_INTERVAL_MS) {
        try {
          // Dynamic import to avoid importing prisma in edge middleware
          const { prisma } = await import("@/lib/prisma");
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { role: true, firstName: true, lastName: true },
          });
          if (dbUser) {
            token.role = dbUser.role as Role;
            token.firstName = dbUser.firstName;
            token.lastName = dbUser.lastName;
          }
          token.roleRefreshedAt = Date.now();
        } catch {
          // DB error — keep existing token values, try again next time
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      return session;
    },
  },
} satisfies NextAuthConfig;
