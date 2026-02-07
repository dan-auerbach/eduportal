import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";

export async function POST() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 400 });
  }

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
