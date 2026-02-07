import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { NotificationList } from "@/components/modules/notification-list";

export default async function NotificationsPage() {
  const ctx = await getTenantContext();
  const user = ctx.user;

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const notificationData = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("notifications.title")}</h1>
        <p className="text-muted-foreground">
          {t("notifications.subtitle")}
        </p>
      </div>

      <NotificationList notifications={notificationData} />
    </div>
  );
}
