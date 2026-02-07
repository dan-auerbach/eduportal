"use client";

import { useRouter } from "next/navigation";
import {
  publishModule,
  unpublishModule,
  archiveModule,
  duplicateModule,
} from "@/actions/modules";
import { toggleCompanyPin } from "@/actions/pinning";
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
import {
  MoreHorizontal,
  Pencil,
  Globe,
  EyeOff,
  Archive,
  Users,
  Copy,
  Pin,
  PinOff,
} from "lucide-react";
import Link from "next/link";
import type { ModuleStatus } from "@/generated/prisma/client";

interface ModuleActionsProps {
  moduleId: string;
  status: ModuleStatus;
  isCompanyPinned: boolean;
}

export function ModuleActions({ moduleId, status, isCompanyPinned }: ModuleActionsProps) {
  const router = useRouter();

  async function handlePublish() {
    const result = await publishModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.modulePublished"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleUnpublish() {
    const result = await unpublishModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.moduleUnpublished"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleArchive() {
    const result = await archiveModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.moduleArchived"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDuplicate() {
    const result = await duplicateModule(moduleId);
    if (result.success) {
      toast.success(t("admin.modules.moduleDuplicated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleToggleCompanyPin() {
    const result = await toggleCompanyPin(moduleId);
    if (result.success) {
      toast.success(
        result.data.pinned
          ? t("admin.modules.modulePinned")
          : t("admin.modules.moduleUnpinned")
      );
      router.refresh();
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
            href={`/admin/modules/${moduleId}/edit`}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            {t("common.edit")}
          </Link>
        </DropdownMenuItem>

        {status !== "PUBLISHED" && (
          <DropdownMenuItem
            onClick={handlePublish}
            className="flex items-center gap-2"
          >
            <Globe className="h-4 w-4" />
            {t("admin.modules.publish")}
          </DropdownMenuItem>
        )}

        {status === "PUBLISHED" && (
          <DropdownMenuItem
            onClick={handleUnpublish}
            className="flex items-center gap-2"
          >
            <EyeOff className="h-4 w-4" />
            {t("admin.modules.unpublish")}
          </DropdownMenuItem>
        )}

        {status !== "ARCHIVED" && (
          <DropdownMenuItem
            onClick={handleArchive}
            className="flex items-center gap-2"
          >
            <Archive className="h-4 w-4" />
            {t("admin.modules.archive")}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href={`/admin/modules/${moduleId}/edit#groups`}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            {t("admin.modules.assignToGroups")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleToggleCompanyPin}
          className="flex items-center gap-2"
        >
          {isCompanyPinned ? (
            <>
              <PinOff className="h-4 w-4" />
              {t("admin.modules.unpinForCompany")}
            </>
          ) : (
            <>
              <Pin className="h-4 w-4" />
              {t("admin.modules.pinForCompany")}
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleDuplicate}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          {t("admin.modules.duplicate")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
