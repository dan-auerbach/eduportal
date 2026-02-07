import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, tenantId } = ctx;
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

  // Find active session for this user + tenant
  const activeSession = await prisma.userSession.findFirst({
    where: { userId: user.id, tenantId, isActive: true },
    orderBy: { startedAt: "desc" },
  });

  if (activeSession) {
    if (activeSession.lastPingAt >= staleThreshold) {
      // Session is still fresh — just update the ping
      await prisma.userSession.update({
        where: { id: activeSession.id },
        data: { lastPingAt: now },
      });
    } else {
      // Session went stale — close it and start a new one
      const duration = Math.round(
        (activeSession.lastPingAt.getTime() - activeSession.startedAt.getTime()) / 1000,
      );
      await prisma.$transaction([
        prisma.userSession.update({
          where: { id: activeSession.id },
          data: { isActive: false, durationSeconds: Math.max(duration, 0) },
        }),
        prisma.userSession.create({
          data: { userId: user.id, tenantId, startedAt: now, lastPingAt: now },
        }),
      ]);
    }
  } else {
    // No active session — create one
    await prisma.userSession.create({
      data: { userId: user.id, tenantId, startedAt: now, lastPingAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}
