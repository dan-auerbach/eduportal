import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { getActiveTenantId } from "@/lib/tenant";
import { storage } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Read from storage (local or R2)
  const obj = await storage.get(attachment.storagePath);
  if (!obj) {
    return new Response("File not found", { status: 404 });
  }

  // Verify integrity if checksum exists
  if (attachment.checksum) {
    const hash = createHash("sha256").update(obj.data).digest("hex");
    if (hash !== attachment.checksum) {
      console.error(`Checksum mismatch for attachment ${id}`);
      return new Response("File integrity error", { status: 500 });
    }
  }

  return new Response(new Uint8Array(obj.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
      "Content-Length": String(obj.size),
    },
  });
}
