import { prisma } from "./prisma";

export type GroupActivityItem = {
  userId: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  moduleId: string;
  moduleTitle: string;
  completedAt: Date;
};

/**
 * Get recent module completions (certificates) from users in the same groups.
 * Used for the social feed on the dashboard.
 * 2 queries: group member IDs + recent certificates.
 */
export async function getRecentGroupCompletions(
  userId: string,
  tenantId: string,
  limit = 10,
): Promise<GroupActivityItem[]> {
  // Q1: Get all users in the same groups as the current user (excluding self)
  const userGroups = await prisma.userGroup.findMany({
    where: { userId, group: { tenantId } },
    select: { groupId: true },
  });

  if (userGroups.length === 0) return [];

  const groupIds = userGroups.map((g) => g.groupId);

  const groupMembers = await prisma.userGroup.findMany({
    where: {
      groupId: { in: groupIds },
      userId: { not: userId },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const memberIds = groupMembers.map((m) => m.userId);
  if (memberIds.length === 0) return [];

  // Q2: Get recent certificates from those members (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const certificates = await prisma.certificate.findMany({
    where: {
      userId: { in: memberIds },
      tenantId,
      issuedAt: { gte: thirtyDaysAgo },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      module: {
        select: { id: true, title: true },
      },
    },
    orderBy: { issuedAt: "desc" },
    take: limit,
  });

  return certificates.map((cert) => ({
    userId: cert.user.id,
    firstName: cert.user.firstName,
    lastName: cert.user.lastName,
    avatar: cert.user.avatar,
    moduleId: cert.module.id,
    moduleTitle: cert.module.title,
    completedAt: cert.issuedAt,
  }));
}
