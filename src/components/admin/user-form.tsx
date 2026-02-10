"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/actions/users";
import { sendInviteEmail, getInvitePreview } from "@/actions/email";
import { getGroups } from "@/actions/groups";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Mail, Copy, CheckCircle2 } from "lucide-react";
import { t } from "@/lib/i18n";

type GroupOption = { id: string; name: string; color: string | null };

type InviteResult = {
  userId: string;
  inviteToken: string;
  userName: string;
};

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Invite success state
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteCopying, setInviteCopying] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  // Fetch groups when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedGroupIds([]);
      setInviteResult(null);
      setInviteSent(false);
      return;
    }
    setGroupsLoading(true);
    getGroups().then((result) => {
      if (result.success && Array.isArray(result.data)) {
        setGroups(
          (result.data as Array<{ id: string; name: string; color: string | null }>).map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
          }))
        );
      }
      setGroupsLoading(false);
    });
  }, [open]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      email: formData.get("email") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      role: formData.get("role") as string,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    };

    const result = await createUser(data);

    if (result.success) {
      toast.success(t("admin.users.userCreated"));
      router.refresh();
      // Show invite actions
      setInviteResult({
        userId: result.data.id,
        inviteToken: result.data.inviteToken,
        userName: `${data.firstName} ${data.lastName}`,
      });
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  async function handleSendInvite() {
    if (!inviteResult) return;
    setInviteSending(true);

    const result = await sendInviteEmail(inviteResult.userId, inviteResult.inviteToken);

    if (result.success) {
      toast.success(t("admin.users.inviteSent"));
      setInviteSent(true);
    } else {
      toast.error(result.error);
    }

    setInviteSending(false);
  }

  async function handleCopyInvite() {
    if (!inviteResult) return;
    setInviteCopying(true);

    try {
      const result = await getInvitePreview(inviteResult.userId, inviteResult.inviteToken);

      if (result.success) {
        const text = `${result.data.subject}\n\n${result.data.body}`;
        try {
          await navigator.clipboard.writeText(text);
          toast.success(t("admin.users.inviteCopied"));
        } catch {
          // Clipboard API may fail (e.g. non-HTTPS, permission denied) — fallback to prompt
          window.prompt(t("admin.users.copyInviteText"), text);
        }
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      console.error("[handleCopyInvite] Error:", err);
      toast.error(err instanceof Error ? err.message : "Napaka pri kopiranju");
    } finally {
      setInviteCopying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.users.addUser")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {inviteResult ? t("admin.users.inviteTitle") : t("admin.users.createUser")}
          </DialogTitle>
        </DialogHeader>

        {/* Invite success view */}
        {inviteResult ? (
          <div className="space-y-4">
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("admin.users.inviteDescription", { name: inviteResult.userName })}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSendInvite}
                disabled={inviteSending || inviteSent}
                className="w-full"
              >
                {inviteSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : inviteSent ? (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {inviteSent
                  ? t("admin.users.inviteSentButton")
                  : inviteSending
                    ? t("admin.users.inviteSending")
                    : t("admin.users.sendInvite")}
              </Button>

              <Button
                variant="outline"
                onClick={handleCopyInvite}
                disabled={inviteCopying}
                className="w-full"
              >
                {inviteCopying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {t("admin.users.copyInviteText")}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          /* User creation form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("admin.users.firstName")}</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("admin.users.lastName")}</Label>
                <Input id="lastName" name="lastName" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("admin.users.tableEmail")}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">{t("admin.users.tableRole")}</Label>
              <Select name="role" defaultValue="EMPLOYEE">
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.users.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">{t("roles.EMPLOYEE")}</SelectItem>
                  <SelectItem value="ADMIN">{t("roles.ADMIN")}</SelectItem>
                  <SelectItem value="SUPER_ADMIN">{t("roles.SUPER_ADMIN")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Group assignment */}
            <div className="space-y-2">
              <Label>{t("admin.users.assignGroups")}</Label>
              {groupsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.users.noGroupsAvailable")}</p>
              ) : (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedGroupIds.includes(group.id)}
                        onCheckedChange={() => toggleGroup(group.id)}
                      />
                      <span className="text-sm">{group.name}</span>
                      {group.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
              {selectedGroupIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedGroupIds.map((gid) => {
                    const g = groups.find((gr) => gr.id === gid);
                    return g ? (
                      <Badge
                        key={gid}
                        variant="secondary"
                        className="text-xs cursor-pointer"
                        onClick={() => toggleGroup(gid)}
                        style={g.color ? { borderColor: g.color, color: g.color } : undefined}
                      >
                        {g.name} ×
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t("common.creating") : t("admin.users.createUser")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
