import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

type Params = Promise<{ id: string }>;

export async function DELETE(
  req: Request,
  { params }: { params: Params },
) {
  // ── Auth: Owner only ───────────────────────────────────────
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: tenantId } = await params;

  // ── Parse body ─────────────────────────────────────────────
  let body: { confirmSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { confirmSlug } = body;

  if (!confirmSlug) {
    return NextResponse.json({ error: "confirmSlug is required" }, { status: 400 });
  }

  // ── Fetch tenant ───────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Validate slug confirmation ─────────────────────────────
  if (confirmSlug !== tenant.slug) {
    return NextResponse.json({ error: "Slug mismatch" }, { status: 400 });
  }

  // ── Pre-delete audit log (tenantId: null so it's not cascade-deleted) ──
  await logAudit({
    actorId: user.id,
    tenantId: undefined, // Global audit — not scoped to tenant
    action: "TENANT_DELETED",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: {
      slug: tenant.slug,
      name: tenant.name,
      deletedBy: user.email,
    },
  });

  // ── Hard delete (all child records cascade via onDelete: Cascade) ──
  await prisma.tenant.delete({
    where: { id: tenantId },
  });

  return NextResponse.json({ ok: true });
}
