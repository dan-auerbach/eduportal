import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

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

  // Find and close the active session
  const activeSession = await prisma.userSession.findFirst({
    where: { userId: user.id, tenantId, isActive: true },
    orderBy: { startedAt: "desc" },
  });

  if (activeSession) {
    const duration = Math.round(
      (activeSession.lastPingAt.getTime() - activeSession.startedAt.getTime()) / 1000,
    );
    await prisma.userSession.update({
      where: { id: activeSession.id },
      data: { isActive: false, durationSeconds: Math.max(duration, 0) },
    });
  }

  return NextResponse.json({ ok: true });
}
