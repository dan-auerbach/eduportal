"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { t, setLocale } from "@/lib/i18n";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// getMyNotifications - get notifications for current user (tenant-scoped)
// ---------------------------------------------------------------------------
export async function getMyNotifications(
  limit: number = 20
): Promise<ActionResult<unknown[]>> {
  try {
    const ctx = await getTenantContext();

    const notifications = await prisma.notification.findMany({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { success: true, data: notifications };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju obvestil" };
  }
}

// ---------------------------------------------------------------------------
// markNotificationRead - mark single notification as read (verify tenant)
// ---------------------------------------------------------------------------
export async function markNotificationRead(
  id: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return { success: false, error: "Obvestilo ne obstaja" };
    }

    if (notification.userId !== ctx.user.id) {
      return { success: false, error: "Nimate dostopa do tega obvestila" };
    }

    // Verify notification belongs to active tenant
    if (notification.tenantId !== ctx.tenantId) {
      return { success: false, error: "Obvestilo ne obstaja" };
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri označevanju obvestila" };
  }
}

// ---------------------------------------------------------------------------
// markAllNotificationsRead - mark all notifications as read (tenant-scoped)
// ---------------------------------------------------------------------------
export async function markAllNotificationsRead(): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await getTenantContext();

    const result = await prisma.notification.updateMany({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId, isRead: false },
      data: { isRead: true },
    });

    return { success: true, data: { count: result.count } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri označevanju obvestil" };
  }
}

// ---------------------------------------------------------------------------
// getUnreadCount - get unread notification count (tenant-scoped)
// ---------------------------------------------------------------------------
export async function getUnreadCount(): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await getTenantContext();

    const count = await prisma.notification.count({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId, isRead: false },
    });

    return { success: true, data: { count } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju števila obvestil" };
  }
}

// ---------------------------------------------------------------------------
// sendDeadlineReminder - admin sends a deadline reminder (tenant-scoped)
// ---------------------------------------------------------------------------
export async function sendDeadlineReminder(
  userId: string,
  moduleId: string,
  moduleTitle: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    setLocale(ctx.tenantLocale);
    await requirePermission(ctx.user, "VIEW_ALL_PROGRESS");

    await prisma.notification.create({
      data: {
        userId,
        tenantId: ctx.tenantId,
        type: "DEADLINE_REMINDER",
        title: t("notifications.deadlineApproaching", { title: moduleTitle }),
        message: t("notifications.deadlineMessage", { time: "preteklo" }),
        link: `/modules/${moduleId}`,
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pošiljanju opomnika" };
  }
}
