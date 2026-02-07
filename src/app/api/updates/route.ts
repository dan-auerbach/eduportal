import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify entry exists
  const entry = await prisma.changelogEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await prisma.changelogEntry.delete({ where: { id } });

  // If the deleted entry was current, promote the most recent remaining one
  if (entry.isCurrent) {
    const latest = await prisma.changelogEntry.findFirst({
      where: { tenantId: null },
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      await prisma.changelogEntry.update({
        where: { id: latest.id },
        data: { isCurrent: true },
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.changelogEntry.findMany({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      version: true,
      title: true,
      summary: true,
      isCurrent: true,
      createdAt: true,
    },
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { version, title, summary } = body;

  if (!version || !title || !summary) {
    return NextResponse.json(
      { error: "version, title, and summary are required" },
      { status: 400 }
    );
  }

  // Set all existing entries to not current, then create the new one
  await prisma.$transaction([
    prisma.changelogEntry.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.changelogEntry.create({
      data: {
        version,
        title,
        summary,
        isCurrent: true,
        createdById: user.id,
        tenantId: null,
      },
    }),
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
