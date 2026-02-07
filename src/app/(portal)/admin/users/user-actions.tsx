"use client";

import { useRouter } from "next/navigation";
import { resetUserPassword } from "@/actions/users";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, UserX, Shield, KeyRound } from "lucide-react";
import Link from "next/link";

interface UserActionsProps {
  userId: string;
}

export function UserActions({ userId }: UserActionsProps) {
  const router = useRouter();

  async function handleResetPassword() {
    const result = await resetUserPassword(userId);
    if (result.success) {
      toast.success(
        t("admin.users.temporaryPassword", { password: result.data.temporaryPassword }),
        { duration: 15000 }
      );
    } else {
      toast.error(result.error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={`/admin/users/${userId}`}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            {t("common.edit")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/admin/users/${userId}#permissions`}
            className="flex items-center gap-2"
          >
            <Shield className="h-4 w-4" />
            {t("admin.users.editPermissions")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleResetPassword}
          className="flex items-center gap-2"
        >
          <KeyRound className="h-4 w-4" />
          {t("admin.users.resetPassword")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/admin/users/${userId}#deactivate`}
            className="flex items-center gap-2 text-destructive"
          >
            <UserX className="h-4 w-4" />
            {t("admin.users.deactivate")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
