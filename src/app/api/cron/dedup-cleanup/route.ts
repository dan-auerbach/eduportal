import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";
import { timingSafeEqual } from "crypto";

function verifyCronSecret(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = subDays(new Date(), 30);

  const result = await prisma.notificationDedup.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: result.count });
}
