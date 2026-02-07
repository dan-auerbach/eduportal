import { readFile } from "fs/promises";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { module: { select: { title: true } } },
  });

  if (!certificate) {
    return new Response("Not found", { status: 404 });
  }

  // Verify certificate belongs to the active tenant
  if (certificate.tenantId !== tenantId) {
    return new Response("Not found", { status: 404 });
  }

  // Only the certificate owner or admins can download
  const isOwner = certificate.userId === session.user.id;
  const isAdmin = session.user.role === "SUPER_ADMIN" || session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!certificate.storagePath) {
    return new Response("Certificate PDF not available", { status: 404 });
  }

  try {
    const buffer = await readFile(certificate.storagePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${certificate.uniqueCode}.pdf"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
