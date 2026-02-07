import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasMinRole, TenantAccessError } from "@/lib/tenant";
import { storage } from "@/lib/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return new Response(e.message, { status: 403 });
    }
    throw e;
  }

  const { id } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { module: { select: { title: true } } },
  });

  if (!certificate) {
    return new Response("Not found", { status: 404 });
  }

  // Verify certificate belongs to the active tenant
  if (certificate.tenantId !== ctx.tenantId) {
    return new Response("Not found", { status: 404 });
  }

  // Only the certificate owner or admins (by tenant role) can download
  const isCertOwner = certificate.userId === ctx.user.id;
  const isAdmin = hasMinRole(ctx.effectiveRole, "ADMIN");
  if (!isCertOwner && !isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!certificate.storagePath) {
    return new Response("Certificate PDF not available", { status: 404 });
  }

  try {
    const obj = await storage.get(certificate.storagePath);
    if (!obj) {
      return new Response("File not found", { status: 404 });
    }
    return new Response(new Uint8Array(obj.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${certificate.uniqueCode}.pdf"`,
        "Content-Length": String(obj.size),
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
