"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addUserToGroup, removeUserFromGroup } from "@/actions/groups";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

const roleBadgeVariant: Record<Role, string> = {
  OWNER: "bg-purple-100 text-purple-800 border-purple-200",
  SUPER_ADMIN: "bg-red-100 text-red-800 border-red-200",
  ADMIN: "bg-blue-100 text-blue-800 border-blue-200",
  EMPLOYEE: "bg-gray-100 text-gray-800 border-gray-200",
};

interface GroupMembersProps {
  groupId: string;
  members: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    isActive: boolean;
  }[];
  availableUsers: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }[];
}

export function GroupMembers({
  groupId,
  members,
  availableUsers,
}: GroupMembersProps) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  async function handleAddUser() {
    if (!selectedUserId) return;
    setAddLoading(true);

    const result = await addUserToGroup(selectedUserId, groupId);

    if (result.success) {
      toast.success(t("admin.groups.userAdded"));
      setSelectedUserId("");
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setAddLoading(false);
  }

  async function handleRemoveUser(userId: string) {
    setRemoveLoading(userId);

    const result = await removeUserFromGroup(userId, groupId);

    if (result.success) {
      toast.success(t("admin.groups.userRemoved"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setRemoveLoading(null);
  }

  return (
    <div className="space-y-4">
      {/* Add member */}
      {availableUsers.length > 0 && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("admin.groups.selectUser")} />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAddUser}
            disabled={!selectedUserId || addLoading}
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            {addLoading ? t("common.adding") : t("common.add")}
          </Button>
        </div>
      )}

      {/* Members table */}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("admin.groups.noMembers")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.groups.memberTable")}</TableHead>
              <TableHead>{t("admin.groups.memberEmail")}</TableHead>
              <TableHead>{t("admin.groups.memberRole")}</TableHead>
              <TableHead>{t("admin.groups.memberStatus")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const initials = `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={roleBadgeVariant[member.role]}
                    >
                      {t(`roles.${member.role}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={member.isActive ? "default" : "secondary"}
                    >
                      {member.isActive ? t("admin.users.statusActive") : t("admin.users.statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveUser(member.id)}
                      disabled={removeLoading === member.id}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
