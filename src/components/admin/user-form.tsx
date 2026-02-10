"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/actions/users";
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
import { Plus, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

type GroupOption = { id: string; name: string; color: string | null };

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Fetch groups when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedGroupIds([]);
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
      password: formData.get("password") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      role: formData.get("role") as string,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    };

    const result = await createUser(data);

    if (result.success) {
      toast.success(t("admin.users.userCreated"));
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
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
          <DialogTitle>{t("admin.users.createUser")}</DialogTitle>
        </DialogHeader>
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
            <Label htmlFor="password">{t("admin.users.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
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
      </DialogContent>
    </Dialog>
  );
}
