"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import {
  Bell,
  BookOpen,
  Clock,
  MessageSquare,
  Award,
  AlertTriangle,
  Settings,
  Check,
  CheckCheck,
  Loader2,
  TrendingUp,
  RefreshCw,
  Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/actions/notifications";
import { t } from "@/lib/i18n";

type NotificationData = {
  id: string;
  type:
    | "NEW_MODULE"
    | "DEADLINE_REMINDER"
    | "QUIZ_RESULT"
    | "COMMENT_REPLY"
    | "CERTIFICATE_ISSUED"
    | "PROGRESS_OVERRIDE"
    | "MODULE_UPDATED"
    | "SYSTEM"
    | "RADAR_APPROVED"
    | "RADAR_REJECTED"
    | "NEW_KNOWLEDGE";
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string; // ISO string
};

const typeIcons: Record<NotificationData["type"], React.ReactNode> = {
  NEW_MODULE: <BookOpen className="h-4 w-4 text-blue-500" />,
  DEADLINE_REMINDER: <Clock className="h-4 w-4 text-orange-500" />,
  QUIZ_RESULT: <TrendingUp className="h-4 w-4 text-purple-500" />,
  COMMENT_REPLY: <MessageSquare className="h-4 w-4 text-green-500" />,
  CERTIFICATE_ISSUED: <Award className="h-4 w-4 text-yellow-500" />,
  PROGRESS_OVERRIDE: <AlertTriangle className="h-4 w-4 text-red-500" />,
  MODULE_UPDATED: <RefreshCw className="h-4 w-4 text-blue-500" />,
  SYSTEM: <Settings className="h-4 w-4 text-gray-500" />,
  RADAR_APPROVED: <Radar className="h-4 w-4 text-green-500" />,
  RADAR_REJECTED: <Radar className="h-4 w-4 text-red-500" />,
  NEW_KNOWLEDGE: <BookOpen className="h-4 w-4 text-emerald-500" />,
};

function getTypeLabel(type: NotificationData["type"]): string {
  const map: Record<NotificationData["type"], string> = {
    NEW_MODULE: t("notifications.typeNewModule"),
    DEADLINE_REMINDER: t("notifications.typeDeadline"),
    QUIZ_RESULT: t("notifications.typeQuizResult"),
    COMMENT_REPLY: t("notifications.typeCommentReply"),
    CERTIFICATE_ISSUED: t("notifications.typeCertificate"),
    PROGRESS_OVERRIDE: t("notifications.typeProgressOverride"),
    MODULE_UPDATED: t("notifications.typeModuleUpdated"),
    SYSTEM: t("notifications.typeSystem"),
    RADAR_APPROVED: t("notifications.typeRadarApproved"),
    RADAR_REJECTED: t("notifications.typeRadarRejected"),
    NEW_KNOWLEDGE: t("notifications.typeNewKnowledge"),
  };
  return map[type];
}

export function NotificationList({
  notifications: initialNotifications,
}: {
  notifications: NotificationData[];
}) {
  const [notifications, setNotifications] =
    useState<NotificationData[]>(initialNotifications);
  const [isPending, startTransition] = useTransition();

  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    });
  }

  function renderNotification(notification: NotificationData) {
    const content = (
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4 transition-colors",
          !notification.isRead && "bg-accent/50 border-primary/20",
          notification.link && "hover:bg-accent cursor-pointer"
        )}
      >
        <div className="mt-0.5 shrink-0">
          {typeIcons[notification.type]}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{notification.title}</p>
                {!notification.isRead && (
                  <Badge className="text-[10px] px-1.5 py-0">{t("notifications.new")}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {notification.message}
              </p>
            </div>
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-7 px-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMarkRead(notification.id);
                }}
                disabled={isPending}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {getTypeLabel(notification.type)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
                locale: getDateLocale(),
              })}
            </span>
          </div>
        </div>
      </div>
    );

    if (notification.link) {
      return (
        <Link
          key={notification.id}
          href={notification.link}
          className="block"
          onClick={() => {
            if (!notification.isRead) {
              handleMarkRead(notification.id);
            }
          }}
        >
          {content}
        </Link>
      );
    }

    return <div key={notification.id}>{content}</div>;
  }

  if (notifications.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">{t("notifications.noNotifications")}</p>
          <p className="text-sm mt-1">{t("notifications.allCaughtUp")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      {unread.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("notifications.unreadCount", { count: unread.length })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
            )}
            {t("notifications.markAllRead")}
          </Button>
        </div>
      )}

      {/* Unread notifications */}
      {unread.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("notifications.unread")}</h3>
          <div className="space-y-2">
            {unread.map(renderNotification)}
          </div>
        </div>
      )}

      {/* Read notifications */}
      {read.length > 0 && (
        <div className="space-y-2">
          {unread.length > 0 && <Separator />}
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("notifications.previouslyRead")}
          </h3>
          <div className="space-y-2">
            {read.map(renderNotification)}
          </div>
        </div>
      )}
    </div>
  );
}
