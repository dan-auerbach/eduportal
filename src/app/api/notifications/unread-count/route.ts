import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getTenantContext();

    const count = await prisma.notification.count({
      where: {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        isRead: false,
      },
    });

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
