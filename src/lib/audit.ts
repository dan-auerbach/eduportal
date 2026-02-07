import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/client";

export async function logAudit(params: {
  actorId?: string;
  tenantId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}) {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    actorId: params.actorId,
    tenantId: params.tenantId,
    metadata: params.metadata ?? Prisma.JsonNull,
    ipAddress: params.ipAddress,
  };
  await prisma.auditLog.create({ data });
}
