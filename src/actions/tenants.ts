"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext, setActiveTenant, setOwnerImpersonation } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  CreateMembershipSchema,
  UpdateMembershipSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/types";
import type { TenantPlan, TenantRole } from "@/generated/prisma/client";
import { checkUserLimit } from "@/lib/plan";
import { hash } from "bcryptjs";

// ---------------------------------------------------------------------------
// getTenants - Owner-only. List all tenants with member count and module count.
// ---------------------------------------------------------------------------
export async function getTenants(): Promise<ActionResult<unknown[]>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik ima dostop do seznama podjetij" };
    }

    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            modules: true,
          },
        },
      },
    });

    return { success: true, data: tenants };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri pridobivanju podjetij",
    };
  }
}

// ---------------------------------------------------------------------------
// getTenant - Owner-only. Get tenant with members and stats.
// ---------------------------------------------------------------------------
export async function getTenant(id: string): Promise<ActionResult<unknown>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik ima dostop do podjetja" };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                isActive: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            memberships: true,
            modules: true,
            groups: true,
            certificates: true,
          },
        },
      },
    });

    if (!tenant) {
      return { success: false, error: "Podjetje ne obstaja" };
    }

    return { success: true, data: tenant };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri pridobivanju podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// createTenant - Owner-only. Create new tenant.
// ---------------------------------------------------------------------------
export async function createTenant(
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik lahko ustvari podjetje" };
    }

    const parsed = CreateTenantSchema.parse(data);

    // Check slug uniqueness
    const existing = await prisma.tenant.findUnique({
      where: { slug: parsed.slug },
    });
    if (existing) {
      return { success: false, error: "Podjetje s to URL oznako ze obstaja" };
    }

    // Check if admin email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.adminEmail },
    });
    if (existingUser) {
      return { success: false, error: "Uporabnik s tem emailom že obstaja" };
    }

    // Hash the admin password
    const passwordHash = await hash(parsed.adminPassword, 12);

    // Create tenant + initial Super Admin + membership in a transaction
    const tenant = await prisma.tenant.create({
      data: {
        name: parsed.name,
        slug: parsed.slug,
        logoUrl: parsed.logoUrl,
        theme: parsed.theme,
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        email: parsed.adminEmail,
        passwordHash,
        firstName: parsed.adminFirstName,
        lastName: parsed.adminLastName,
        role: "ADMIN", // global role — tenant role is SUPER_ADMIN
      },
    });

    await prisma.membership.create({
      data: {
        userId: adminUser.id,
        tenantId: tenant.id,
        role: "SUPER_ADMIN",
      },
    });

    await logAudit({
      actorId: user.id,
      tenantId: tenant.id,
      action: "TENANT_CREATED",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        name: tenant.name,
        slug: tenant.slug,
        initialAdmin: parsed.adminEmail,
      },
    });

    await logAudit({
      actorId: user.id,
      tenantId: tenant.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: adminUser.id,
      metadata: {
        email: parsed.adminEmail,
        role: "SUPER_ADMIN",
        action: "initial_admin",
      },
    });

    revalidatePath("/owner/tenants");

    return { success: true, data: { id: tenant.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri ustvarjanju podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// updateTenant - Owner-only or tenant SUPER_ADMIN. Update tenant.
// ---------------------------------------------------------------------------
export async function updateTenant(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();

    // Owner can update any tenant; tenant SUPER_ADMIN can update their own
    if (user.role !== "OWNER") {
      const ctx = await getTenantContext();
      if (ctx.tenantId !== id || ctx.effectiveRole !== "SUPER_ADMIN") {
        return { success: false, error: "Nimate pravic za posodabljanje tega podjetja" };
      }
    }

    const parsed = UpdateTenantSchema.parse(data);

    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Podjetje ne obstaja" };
    }

    // If slug is being changed, check uniqueness
    if (parsed.slug && parsed.slug !== existing.slug) {
      const slugTaken = await prisma.tenant.findUnique({
        where: { slug: parsed.slug },
      });
      if (slugTaken) {
        return { success: false, error: "Podjetje s to URL oznako ze obstaja" };
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: parsed,
    });

    await logAudit({
      actorId: user.id,
      tenantId: tenant.id,
      action: "TENANT_UPDATED",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { changes: parsed },
    });

    revalidatePath("/owner/tenants");
    revalidatePath(`/owner/tenants/${id}`);

    return { success: true, data: { id: tenant.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri posodabljanju podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// archiveTenant - Owner-only. Soft-delete by setting archivedAt.
// ---------------------------------------------------------------------------
export async function archiveTenant(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik lahko arhivira podjetje" };
    }

    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Podjetje ne obstaja" };
    }

    if (existing.archivedAt) {
      return { success: false, error: "Podjetje je ze arhivirano" };
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await logAudit({
      actorId: user.id,
      tenantId: tenant.id,
      action: "TENANT_ARCHIVED",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { name: tenant.name },
    });

    revalidatePath("/owner/tenants");

    return { success: true, data: { id: tenant.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri arhiviranju podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// getTenantMembers - Owner or tenant SUPER_ADMIN. List members with user info.
// ---------------------------------------------------------------------------
export async function getTenantMembers(
  tenantId: string
): Promise<ActionResult<unknown[]>> {
  try {
    const user = await getCurrentUser();

    if (user.role !== "OWNER") {
      const ctx = await getTenantContext();
      if (ctx.tenantId !== tenantId || ctx.effectiveRole !== "SUPER_ADMIN") {
        return { success: false, error: "Nimate pravic za ogled clanov tega podjetja" };
      }
    }

    const members = await prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: members };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri pridobivanju clanov",
    };
  }
}

// ---------------------------------------------------------------------------
// addTenantMember - Owner or tenant SUPER_ADMIN. Add member with role.
// ---------------------------------------------------------------------------
export async function addTenantMember(
  tenantId: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();

    if (user.role !== "OWNER") {
      const ctx = await getTenantContext();
      if (ctx.tenantId !== tenantId || ctx.effectiveRole !== "SUPER_ADMIN") {
        return { success: false, error: "Nimate pravic za dodajanje clanov" };
      }
    }

    const parsed = CreateMembershipSchema.parse(data);

    // Check tenant exists and is not archived
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.archivedAt) {
      return { success: false, error: "Podjetje ne obstaja ali je arhivirano" };
    }

    // Plan limit check
    const limitCheck = await checkUserLimit(tenantId, tenant.plan);
    if (!limitCheck.allowed) {
      return { success: false, error: "LIMIT_USERS_REACHED" };
    }

    // Check user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: parsed.userId },
    });
    if (!targetUser) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    // Check for existing membership
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: parsed.userId, tenantId } },
    });
    if (existingMembership) {
      return { success: false, error: "Uporabnik je ze clan tega podjetja" };
    }

    const membership = await prisma.membership.create({
      data: {
        userId: parsed.userId,
        tenantId,
        role: parsed.role as TenantRole,
      },
    });

    await logAudit({
      actorId: user.id,
      tenantId,
      action: "MEMBERSHIP_CHANGED",
      entityType: "Membership",
      entityId: membership.id,
      metadata: {
        userId: parsed.userId,
        role: parsed.role,
        action: "added",
      },
    });

    revalidatePath(`/owner/tenants/${tenantId}`);

    return { success: true, data: { id: membership.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri dodajanju clana",
    };
  }
}

// ---------------------------------------------------------------------------
// updateTenantMemberRole - Owner or tenant SUPER_ADMIN. Change role.
// ---------------------------------------------------------------------------
export async function updateTenantMemberRole(
  tenantId: string,
  userId: string,
  role: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();

    if (user.role !== "OWNER") {
      const ctx = await getTenantContext();
      if (ctx.tenantId !== tenantId || ctx.effectiveRole !== "SUPER_ADMIN") {
        return { success: false, error: "Nimate pravic za spremembo vloge" };
      }
    }

    const parsed = UpdateMembershipSchema.parse({ role });

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      return { success: false, error: "Clanarino ne obstaja" };
    }

    const updated = await prisma.membership.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { role: parsed.role as TenantRole },
    });

    await logAudit({
      actorId: user.id,
      tenantId,
      action: "MEMBERSHIP_CHANGED",
      entityType: "Membership",
      entityId: updated.id,
      metadata: {
        userId,
        oldRole: membership.role,
        newRole: parsed.role,
        action: "role_changed",
      },
    });

    revalidatePath(`/owner/tenants/${tenantId}`);

    return { success: true, data: { id: updated.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri spremembi vloge",
    };
  }
}

// ---------------------------------------------------------------------------
// removeTenantMember - Owner or tenant SUPER_ADMIN. Remove membership.
// ---------------------------------------------------------------------------
export async function removeTenantMember(
  tenantId: string,
  userId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();

    if (user.role !== "OWNER") {
      const ctx = await getTenantContext();
      if (ctx.tenantId !== tenantId || ctx.effectiveRole !== "SUPER_ADMIN") {
        return { success: false, error: "Nimate pravic za odstranitev clana" };
      }
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      return { success: false, error: "Clanarino ne obstaja" };
    }

    await prisma.membership.delete({
      where: { userId_tenantId: { userId, tenantId } },
    });

    await logAudit({
      actorId: user.id,
      tenantId,
      action: "MEMBERSHIP_CHANGED",
      entityType: "Membership",
      entityId: membership.id,
      metadata: {
        userId,
        role: membership.role,
        action: "removed",
      },
    });

    revalidatePath(`/owner/tenants/${tenantId}`);

    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri odstranitvi clana",
    };
  }
}

// ---------------------------------------------------------------------------
// startImpersonation - Owner-only. Sets impersonation cookie.
// ---------------------------------------------------------------------------
export async function startImpersonation(
  tenantId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik lahko prevzame vlogo" };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.archivedAt) {
      return { success: false, error: "Podjetje ne obstaja ali je arhivirano" };
    }

    await setOwnerImpersonation(tenantId);

    await logAudit({
      actorId: user.id,
      tenantId,
      action: "OWNER_IMPERSONATION",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { action: "start", tenantName: tenant.name },
    });

    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri prevzemu vloge",
    };
  }
}

// ---------------------------------------------------------------------------
// stopImpersonation - Owner-only. Clears impersonation cookie.
// ---------------------------------------------------------------------------
export async function stopImpersonation(): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik lahko prekine prevzem vloge" };
    }

    await setOwnerImpersonation(null);

    await logAudit({
      actorId: user.id,
      action: "OWNER_IMPERSONATION",
      entityType: "Tenant",
      entityId: "system",
      metadata: { action: "stop" },
    });

    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri prekinitvi prevzema vloge",
    };
  }
}

// ---------------------------------------------------------------------------
// switchTenant - Any user with membership. Switches active tenant cookie.
// ---------------------------------------------------------------------------
export async function switchTenant(
  tenantId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();

    // Owners can switch to any tenant
    if (user.role !== "OWNER") {
      // Verify user has membership in the target tenant
      const membership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId } },
      });
      if (!membership) {
        return { success: false, error: "Niste clan tega podjetja" };
      }
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.archivedAt) {
      return { success: false, error: "Podjetje ne obstaja ali je arhivirano" };
    }

    await setActiveTenant(tenantId);

    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri preklopu podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// updateTenantSettings - Tenant SUPER_ADMIN+. Update logoUrl and theme.
// ---------------------------------------------------------------------------
export async function updateTenantSettings(
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    // Require at least SUPER_ADMIN role within the tenant
    if (ctx.effectiveRole !== "SUPER_ADMIN" && ctx.effectiveRole !== ("OWNER" as TenantRole)) {
      return { success: false, error: "Nimate pravic za posodabljanje nastavitev podjetja" };
    }

    const parsed = UpdateTenantSchema.parse(data);

    // Whitelist of allowed fields for this action
    const updateData: Record<string, unknown> = {};
    if (parsed.logoUrl !== undefined) updateData.logoUrl = parsed.logoUrl;
    if (parsed.theme !== undefined) updateData.theme = parsed.theme;
    if (parsed.locale !== undefined) updateData.locale = parsed.locale;
    // Email template fields
    if (parsed.emailInviteSubject !== undefined) updateData.emailInviteSubject = parsed.emailInviteSubject;
    if (parsed.emailInviteBody !== undefined) updateData.emailInviteBody = parsed.emailInviteBody;
    if (parsed.emailResetSubject !== undefined) updateData.emailResetSubject = parsed.emailResetSubject;
    if (parsed.emailResetBody !== undefined) updateData.emailResetBody = parsed.emailResetBody;

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: updateData,
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "TENANT_UPDATED",
      entityType: "Tenant",
      entityId: ctx.tenantId,
      metadata: { changes: { logoUrl: parsed.logoUrl, theme: parsed.theme, locale: parsed.locale } },
    });

    revalidatePath("/");

    return { success: true, data: { id: tenant.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri posodabljanju nastavitev podjetja",
    };
  }
}

// ---------------------------------------------------------------------------
// getEmailTemplates - get custom email templates for current tenant
// ---------------------------------------------------------------------------
export async function getEmailTemplates(): Promise<ActionResult<{
  emailInviteSubject: string | null;
  emailInviteBody: string | null;
  emailResetSubject: string | null;
  emailResetBody: string | null;
}>> {
  try {
    const ctx = await getTenantContext();
    if (ctx.effectiveRole !== "SUPER_ADMIN" && ctx.effectiveRole !== ("OWNER" as TenantRole)) {
      return { success: false, error: "Nimate pravic" };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        emailInviteSubject: true,
        emailInviteBody: true,
        emailResetSubject: true,
        emailResetBody: true,
      },
    });

    if (!tenant) {
      return { success: false, error: "Podjetje ne obstaja" };
    }

    return { success: true, data: tenant };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ---------------------------------------------------------------------------
// changeTenantPlan - Owner-only. Switch plan between FREE and PRO.
// ---------------------------------------------------------------------------
export async function changeTenantPlan(
  tenantId: string,
  plan: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "OWNER") {
      return { success: false, error: "Samo lastnik lahko spremeni paket podjetja" };
    }

    if (plan !== "FREE" && plan !== "STARTER" && plan !== "PRO") {
      return { success: false, error: "Neveljaven paket" };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "Podjetje ne obstaja" };
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: plan as TenantPlan },
    });

    await logAudit({
      actorId: user.id,
      tenantId,
      action: "TENANT_UPDATED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { oldPlan: tenant.plan, newPlan: plan },
    });

    revalidatePath("/owner");
    revalidatePath(`/owner/tenants/${tenantId}`);

    return { success: true, data: { id: updated.id } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri spremembi paketa",
    };
  }
}
