"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/actions/users";
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
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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
