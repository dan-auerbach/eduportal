import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { getActiveTenantId } from "@/lib/tenant";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    return new Response("No active tenant", { status: 403 });
  }

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { section: { select: { moduleId: true } } },
  });

  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  // Verify attachment belongs to the active tenant
  if (attachment.tenantId !== tenantId) {
    return new Response("Not found", { status: 404 });
  }

  const hasAccess = await checkModuleAccess(session.user.id!, attachment.section.moduleId);
  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  // Verify integrity if checksum exists
  if (attachment.checksum) {
    try {
      const buffer = await readFile(attachment.storagePath);
      const hash = createHash("sha256").update(buffer).digest("hex");
      if (hash !== attachment.checksum) {
        console.error(`Checksum mismatch for attachment ${id}`);
        return new Response("File integrity error", { status: 500 });
      }
    } catch {
      return new Response("File not found on disk", { status: 404 });
    }
  }

  try {
    const buffer = await readFile(attachment.storagePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${attachment.fileName}"`,
        "Content-Length": String(attachment.fileSize),
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
