"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  bulkDeactivateUsers,
  bulkReactivateUsers,
  bulkDeleteUsers,
} from "@/actions/users";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserActions } from "./user-actions";
import { UserX, UserCheck, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { formatDuration } from "@/lib/utils";
import Link from "next/link";
import type { Role } from "@/generated/prisma/client";

const roleBadgeVariant: Record<Role, string> = {
  OWNER: "bg-purple-100 text-purple-800 border-purple-200",
  SUPER_ADMIN: "bg-red-100 text-red-800 border-red-200",
  ADMIN: "bg-blue-100 text-blue-800 border-blue-200",
  EMPLOYEE: "bg-gray-100 text-gray-800 border-gray-200",
};

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  avatar: string | null;
  groups: Array<{
    groupId: string;
    group: { id: string; name: string; color: string | null };
  }>;
};

type UsageData = {
  seconds30d: number;
  sessions30d: number;
  lastSeenAt: string | null;
};

interface Props {
  activeUsers: UserRow[];
  deactivatedUsers: UserRow[];
  usageMap: Record<string, UsageData>;
  isOwner: boolean;
}

type ConfirmAction = {
  type: "deactivate" | "reactivate" | "delete";
  userIds: string[];
};

export function UsersTableWithBulkActions({
  activeUsers,
  deactivatedUsers,
  usageMap,
  isOwner,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedActive, setSelectedActive] = useState<Set<string>>(new Set());
  const [selectedDeactivated, setSelectedDeactivated] = useState<Set<string>>(
    new Set()
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null
  );
  const [executing, setExecuting] = useState(false);

  // ── Selection helpers ──────────────────────────────────────────

  function toggleActive(userId: string) {
    setSelectedActive((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllActive() {
    setSelectedActive((prev) =>
      prev.size === activeUsers.length
        ? new Set()
        : new Set(activeUsers.map((u) => u.id))
    );
  }

  function toggleDeactivated(userId: string) {
    setSelectedDeactivated((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllDeactivated() {
    setSelectedDeactivated((prev) =>
      prev.size === deactivatedUsers.length
        ? new Set()
        : new Set(deactivatedUsers.map((u) => u.id))
    );
  }

  // ── Execute bulk action ────────────────────────────────────────

  async function handleConfirm() {
    if (!confirmAction) return;
    setExecuting(true);

    let result;
    if (confirmAction.type === "deactivate") {
      result = await bulkDeactivateUsers(confirmAction.userIds);
    } else if (confirmAction.type === "reactivate") {
      result = await bulkReactivateUsers(confirmAction.userIds);
    } else {
      result = await bulkDeleteUsers(confirmAction.userIds);
    }

    if (result.success) {
      const key =
        confirmAction.type === "deactivate"
          ? "bulkDeactivateSuccess"
          : confirmAction.type === "reactivate"
            ? "bulkReactivateSuccess"
            : "bulkDeleteSuccess";
      toast.success(
        t(`admin.users.${key}`, { count: String(result.data.count) })
      );
      setSelectedActive(new Set());
      setSelectedDeactivated(new Set());
      startTransition(() => router.refresh());
    } else {
      toast.error(result.error);
    }

    setExecuting(false);
    setConfirmAction(null);
  }

  function getConfirmTitle() {
    if (!confirmAction) return "";
    if (confirmAction.type === "deactivate")
      return t("admin.users.bulkDeactivate");
    if (confirmAction.type === "reactivate")
      return t("admin.users.bulkReactivate");
    return t("admin.users.bulkDelete");
  }

  function getConfirmDescription() {
    if (!confirmAction) return "";
    const count = String(confirmAction.userIds.length);
    if (confirmAction.type === "deactivate")
      return t("admin.users.bulkDeactivateConfirm", { count });
    if (confirmAction.type === "reactivate")
      return t("admin.users.bulkReactivateConfirm", { count });
    return t("admin.users.bulkDeleteConfirm", { count });
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <>
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            {t("admin.users.tabActive")} ({activeUsers.length})
          </TabsTrigger>
          <TabsTrigger value="deactivated">
            {t("admin.users.tabDeactivated")} ({deactivatedUsers.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Active users tab ────────────────────────────────────── */}
        <TabsContent value="active">
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        activeUsers.length > 0 &&
                        selectedActive.size === activeUsers.length
                      }
                      onCheckedChange={toggleAllActive}
                    />
                  </TableHead>
                  <TableHead>{t("admin.users.tableUser")}</TableHead>
                  <TableHead>{t("admin.users.tableEmail")}</TableHead>
                  <TableHead>{t("admin.users.tableRole")}</TableHead>
                  <TableHead>{t("admin.users.tableGroups")}</TableHead>
                  <TableHead>{t("admin.users.tableLastLogin")}</TableHead>
                  <TableHead>{t("admin.users.usage30d")}</TableHead>
                  <TableHead>{t("admin.users.visits30d")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      {t("admin.users.noUsersFound")}
                    </TableCell>
                  </TableRow>
                ) : (
                  activeUsers.map((user) => {
                    const initials =
                      `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
                    const usage = usageMap[user.id];
                    const lastSeenAt = usage?.lastSeenAt
                      ? new Date(usage.lastSeenAt)
                      : null;
                    return (
                      <TableRow
                        key={user.id}
                        data-state={
                          selectedActive.has(user.id) ? "selected" : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedActive.has(user.id)}
                            onCheckedChange={() => toggleActive(user.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="flex items-center gap-3 hover:underline"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {user.firstName} {user.lastName}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={roleBadgeVariant[user.role]}
                          >
                            {t(`roles.${user.role}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.groups.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {t("admin.users.noGroups")}
                              </span>
                            ) : (
                              user.groups.map((ug) => (
                                <Badge
                                  key={ug.groupId}
                                  variant="outline"
                                  className="text-xs"
                                  style={
                                    ug.group.color
                                      ? {
                                          borderColor: ug.group.color,
                                          color: ug.group.color,
                                        }
                                      : undefined
                                  }
                                >
                                  {ug.group.name}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              {user.lastLoginAt
                                ? format(
                                    new Date(user.lastLoginAt),
                                    "d. MMM yyyy, HH:mm",
                                    { locale: getDateLocale() }
                                  )
                                : t("common.never")}
                            </span>
                            {lastSeenAt && (
                              <p className="text-xs text-muted-foreground/70">
                                {t("admin.users.lastActivity")}:{" "}
                                {format(lastSeenAt, "d. MMM, HH:mm", {
                                  locale: getDateLocale(),
                                })}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDuration(usage?.seconds30d ?? 0)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {usage?.sessions30d ?? "—"}
                        </TableCell>
                        <TableCell>
                          <UserActions userId={user.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Floating bulk action bar */}
          {selectedActive.size > 0 && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-lg border bg-card p-3 shadow-lg">
              <span className="text-sm font-medium">
                {t("admin.users.selectedCount", {
                  count: String(selectedActive.size),
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setConfirmAction({
                      type: "deactivate",
                      userIds: [...selectedActive],
                    })
                  }
                >
                  <UserX className="mr-1.5 h-3.5 w-3.5" />
                  {t("admin.users.bulkDeactivate")}
                </Button>
                {isOwner && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      setConfirmAction({
                        type: "delete",
                        userIds: [...selectedActive],
                      })
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("admin.users.bulkDelete")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Deactivated users tab ───────────────────────────────── */}
        <TabsContent value="deactivated">
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        deactivatedUsers.length > 0 &&
                        selectedDeactivated.size === deactivatedUsers.length
                      }
                      onCheckedChange={toggleAllDeactivated}
                    />
                  </TableHead>
                  <TableHead>{t("admin.users.tableUser")}</TableHead>
                  <TableHead>{t("admin.users.tableEmail")}</TableHead>
                  <TableHead>{t("admin.users.tableRole")}</TableHead>
                  <TableHead>{t("admin.users.deactivatedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deactivatedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      {t("admin.users.noDeactivatedUsers")}
                    </TableCell>
                  </TableRow>
                ) : (
                  deactivatedUsers.map((user) => {
                    const initials =
                      `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
                    return (
                      <TableRow
                        key={user.id}
                        data-state={
                          selectedDeactivated.has(user.id)
                            ? "selected"
                            : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedDeactivated.has(user.id)}
                            onCheckedChange={() =>
                              toggleDeactivated(user.id)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-muted-foreground">
                              {user.firstName} {user.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={roleBadgeVariant[user.role]}
                          >
                            {t(`roles.${user.role}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.deletedAt
                            ? format(
                                new Date(user.deletedAt),
                                "d. MMM yyyy, HH:mm",
                                { locale: getDateLocale() }
                              )
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Floating bulk action bar */}
          {selectedDeactivated.size > 0 && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-lg border bg-card p-3 shadow-lg">
              <span className="text-sm font-medium">
                {t("admin.users.selectedCount", {
                  count: String(selectedDeactivated.size),
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirmAction({
                      type: "reactivate",
                      userIds: [...selectedDeactivated],
                    })
                  }
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                  {t("admin.users.bulkReactivate")}
                </Button>
                {isOwner && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      setConfirmAction({
                        type: "delete",
                        userIds: [...selectedDeactivated],
                      })
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("admin.users.bulkDelete")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Confirmation dialog ─────────────────────────────────── */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmAction?.type === "delete" && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              {getConfirmTitle()}
            </DialogTitle>
            <DialogDescription>{getConfirmDescription()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={
                confirmAction?.type === "delete" ? "destructive" : "default"
              }
              onClick={handleConfirm}
              disabled={executing}
            >
              {executing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
