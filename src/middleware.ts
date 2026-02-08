import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/auth/login", "/auth/forgot-password", "/auth/reset-password", "/verify"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API auth, cron, and public asset routes (logos, covers)
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/logos") ||
    pathname.startsWith("/api/covers")
  ) {
    return NextResponse.next();
  }

  // Allow tenant picker page for authenticated users
  if (pathname === "/select-tenant") {
    if (!req.auth) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth.user?.role;

  // Owner route protection — only OWNER
  if (pathname.startsWith("/owner")) {
    if (role !== "OWNER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Admin route protection — OWNER, SUPER_ADMIN or ADMIN
  if (pathname.startsWith("/admin")) {
    if (role !== "OWNER" && role !== "SUPER_ADMIN" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo\\.png|public/).*)"],
};
