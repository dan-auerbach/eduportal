import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getCurrentUser, type SessionUser } from "./auth";
import type { TenantRole, TenantTheme, TenantPlan } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n";

const TENANT_COOKIE = "mentor-tenant";
const OWNER_IMPERSONATION_COOKIE = "mentor-owner-tenant";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantTheme: TenantTheme;
  tenantPlan: TenantPlan;
  tenantLocale: Locale;
  tenantLogoUrl: string | null;
  membership: { id: string; role: TenantRole } | null;
  effectiveRole: TenantRole;
  isOwnerImpersonating: boolean;
  user: SessionUser;
};

export class TenantAccessError extends Error {
  code: string;
  constructor(message = "Access denied", code = "FORBIDDEN") {
    super(message);
    this.name = "TenantAccessError";
    this.code = code;
  }
}

/**
 * Read the active tenant ID from cookie
 */
export async function getActiveTenantId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TENANT_COOKIE)?.value ?? null;
}

/**
 * Get the full tenant context for the current request.
 * Wrapped with React.cache() so that layout + page share a single
 * execution per request — avoids duplicate DB queries.
 */
export const getTenantContext = cache(_getTenantContextImpl);

/**
 * Auto-select a tenant for the user when no valid cookie exists.
 * Extracted as a helper to allow re-use after stale cookie cleanup.
 */
async function _autoSelectTenant(
  user: SessionUser,
  isOwner: boolean,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<string> {
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { tenant: true },
  });
  const active = memberships.filter((m) => !m.tenant.archivedAt);

  if (active.length === 1) {
    const tid = active[0].tenantId;
    try {
      cookieStore.set(TENANT_COOKIE, tid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } catch {
      // Server Component read-only context
    }
    return tid;
  }

  if (active.length === 0 && !isOwner) {
    throw new TenantAccessError("Niste član nobenega podjetja", "NO_MEMBERSHIP");
  }

  if (isOwner) {
    const firstTenant = await prisma.tenant.findFirst({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (firstTenant) return firstTenant.id;
    throw new TenantAccessError("Ni podjetij v sistemu", "NO_TENANTS");
  }

  // Multiple memberships — redirect to picker
  throw new TenantAccessError("Izberite podjetje", "TENANT_PICKER_REQUIRED");
}

async function _getTenantContextImpl(): Promise<TenantContext> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();

  const isOwner = user.role === "OWNER";
  const ownerTenantId = cookieStore.get(OWNER_IMPERSONATION_COOKIE)?.value;

  let tenantId: string | null = null;
  let isOwnerImpersonating = false;

  if (isOwner && ownerTenantId) {
    tenantId = ownerTenantId;
    isOwnerImpersonating = true;
  } else {
    tenantId = cookieStore.get(TENANT_COOKIE)?.value ?? null;
  }

  // Auto-select if user has no tenant cookie
  if (!tenantId) {
    tenantId = await _autoSelectTenant(user, isOwner, cookieStore);
  }

  // Fetch tenant and validate the cookie is still valid.
  // If the cookie points to a deleted/archived tenant or the user lost membership,
  // clear the stale cookie and fall back to auto-select to prevent redirect loops.
  let tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if ((!tenant || tenant.archivedAt) && !isOwnerImpersonating) {
    // Stale tenant cookie — clear and retry auto-select
    try { cookieStore.delete(TENANT_COOKIE); } catch { /* read-only context */ }
    tenantId = await _autoSelectTenant(user, isOwner, cookieStore);
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  if (!tenant || tenant.archivedAt) {
    throw new TenantAccessError("Podjetje ne obstaja ali je arhivirano", "NOT_FOUND");
  }

  // Check membership
  let membership = null;
  let effectiveRole: TenantRole;

  if (isOwner) {
    effectiveRole = "OWNER" as TenantRole;
    membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
  } else {
    membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (!membership) {
      // User lost access to this tenant — clear stale cookie and retry
      try { cookieStore.delete(TENANT_COOKIE); } catch { /* read-only context */ }
      tenantId = await _autoSelectTenant(user, isOwner, cookieStore);
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.archivedAt) {
        throw new TenantAccessError("Podjetje ne obstaja ali je arhivirano", "NOT_FOUND");
      }
      membership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId } },
      });
      if (!membership) {
        throw new TenantAccessError("Niste član tega podjetja", "FORBIDDEN");
      }
      effectiveRole = membership.role;
    } else {
      effectiveRole = membership.role;
    }
  }

  // Validate locale — fallback to "en" if the DB value is not supported
  const { isValidLocale, DEFAULT_LOCALE, setLocale } = await import("@/lib/i18n");
  const tenantLocale = isValidLocale(tenant.locale) ? tenant.locale : DEFAULT_LOCALE;

  // Set the active locale immediately so that any subsequent t() calls
  // in the same request use the correct language.
  // This is critical because in Next.js App Router, page and layout
  // Server Components execute in parallel — the page may call t()
  // before the layout has a chance to call setLocale().
  setLocale(tenantLocale);

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantTheme: tenant.theme,
    tenantPlan: tenant.plan,
    tenantLocale,
    tenantLogoUrl: tenant.logoUrl,
    membership: membership ? { id: membership.id, role: membership.role } : null,
    effectiveRole,
    isOwnerImpersonating,
    user,
  };
}

// Role hierarchy for comparison
const ROLE_HIERARCHY: Record<TenantRole, number> = {
  OWNER: 6,
  SUPER_ADMIN: 5,
  ADMIN: 4,
  HR: 3,
  EMPLOYEE: 2,
  VIEWER: 1,
};

export function hasMinRole(userRole: TenantRole, minRole: TenantRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

/**
 * Get tenant context and verify the user has at least `minRole`.
 */
export async function requireTenantRole(minRole: TenantRole): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!hasMinRole(ctx.effectiveRole, minRole)) {
    throw new TenantAccessError("Nimate ustrezne vloge za to dejanje", "FORBIDDEN");
  }
  return ctx;
}

/**
 * Set the active tenant cookie (for tenant switching).
 */
export async function setActiveTenant(tenantId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Set or clear the owner impersonation cookie.
 */
export async function setOwnerImpersonation(tenantId: string | null): Promise<void> {
  const cookieStore = await cookies();
  if (tenantId) {
    cookieStore.set(OWNER_IMPERSONATION_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });
    // Also set regular tenant cookie
    cookieStore.set(TENANT_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    cookieStore.delete(OWNER_IMPERSONATION_COOKIE);
  }
}
