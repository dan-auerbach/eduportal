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
import { MemberRoleSelect, RemoveMemberButton } from "./tenant-member-actions";
import { UserX, UserCheck, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { TenantRole } from "@/generated/prisma/client";

type MembershipRow = {
  id: string;
  role: TenantRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    isActive: boolean;
    deletedAt: Date | null;
  };
};

interface Props {
  tenantId: string;
  activeMemberships: MembershipRow[];
  deactivatedMemberships: MembershipRow[];
}

type ConfirmAction = {
  type: "deactivate" | "reactivate" | "delete";
  userIds: string[];
};

export function TenantMembersTable({
  tenantId,
  activeMemberships,
  deactivatedMemberships,
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
      prev.size === activeMemberships.length
        ? new Set()
        : new Set(activeMemberships.map((m) => m.user.id))
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
      prev.size === deactivatedMemberships.length
        ? new Set()
        : new Set(deactivatedMemberships.map((m) => m.user.id))
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
            {t("admin.users.tabActive")} ({activeMemberships.length})
          </TabsTrigger>
          <TabsTrigger value="deactivated">
            {t("admin.users.tabDeactivated")} ({deactivatedMemberships.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Active members tab ──────────────────────────────────── */}
        <TabsContent value="active">
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        activeMemberships.length > 0 &&
                        selectedActive.size === activeMemberships.length
                      }
                      onCheckedChange={toggleAllActive}
                    />
                  </TableHead>
                  <TableHead>{t("admin.users.tableUser")}</TableHead>
                  <TableHead>{t("admin.users.tableEmail")}</TableHead>
                  <TableHead>{t("tenant.memberRole")}</TableHead>
                  <TableHead>{t("admin.users.tableStatus")}</TableHead>
                  <TableHead className="w-[50px]">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMemberships.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      {t("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  activeMemberships.map((membership) => (
                    <TableRow
                      key={membership.id}
                      data-state={
                        selectedActive.has(membership.user.id)
                          ? "selected"
                          : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedActive.has(membership.user.id)}
                          onCheckedChange={() =>
                            toggleActive(membership.user.id)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {membership.user.firstName} {membership.user.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {membership.user.email}
                      </TableCell>
                      <TableCell>
                        <MemberRoleSelect
                          tenantId={tenantId}
                          userId={membership.user.id}
                          currentRole={membership.role}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {t("admin.users.statusActive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <RemoveMemberButton
                          tenantId={tenantId}
                          userId={membership.user.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))
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
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Deactivated members tab ─────────────────────────────── */}
        <TabsContent value="deactivated">
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        deactivatedMemberships.length > 0 &&
                        selectedDeactivated.size ===
                          deactivatedMemberships.length
                      }
                      onCheckedChange={toggleAllDeactivated}
                    />
                  </TableHead>
                  <TableHead>{t("admin.users.tableUser")}</TableHead>
                  <TableHead>{t("admin.users.tableEmail")}</TableHead>
                  <TableHead>{t("tenant.memberRole")}</TableHead>
                  <TableHead>{t("admin.users.deactivatedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deactivatedMemberships.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      {t("admin.users.noDeactivatedUsers")}
                    </TableCell>
                  </TableRow>
                ) : (
                  deactivatedMemberships.map((membership) => (
                    <TableRow
                      key={membership.id}
                      data-state={
                        selectedDeactivated.has(membership.user.id)
                          ? "selected"
                          : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedDeactivated.has(membership.user.id)}
                          onCheckedChange={() =>
                            toggleDeactivated(membership.user.id)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">
                        {membership.user.firstName} {membership.user.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {membership.user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t(`tenantRoles.${membership.role}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {membership.user.deletedAt
                          ? format(
                              new Date(membership.user.deletedAt),
                              "d. MMM yyyy, HH:mm",
                              { locale: getDateLocale() }
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
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
