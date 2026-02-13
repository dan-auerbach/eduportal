/**
 * AI Builder status polling endpoint.
 * Returns the current status of an AI module build.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const buildId = searchParams.get("buildId");

  if (!buildId) {
    return NextResponse.json({ error: "buildId is required" }, { status: 400 });
  }

  const build = await prisma.aiModuleBuild.findUnique({
    where: { id: buildId },
    select: {
      id: true,
      status: true,
      error: true,
      createdModuleId: true,
      createdById: true,
    },
  });

  if (!build || build.createdById !== user.id) {
    return NextResponse.json({ error: "Build not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: build.id,
    status: build.status,
    error: build.error,
    createdModuleId: build.createdModuleId,
  });
}
