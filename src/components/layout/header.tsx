"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, LogOut, User, Menu } from "lucide-react";
import Link from "next/link";

type HeaderProps = {
  tenantLogoUrl?: string | null;
  onMenuClick?: () => void;
};

export function Header({ tenantLogoUrl, onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 md:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Odpri meni</span>
        </Button>
        {tenantLogoUrl && (
          <img src={tenantLogoUrl} alt="Tenant logo" width={28} height={28} className="h-7 w-7 rounded object-contain hidden md:block" />
        )}
      </div>
      <div className="flex items-center gap-1 md:gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/notifications">
            <Bell className="h-4 w-4" />
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm hidden sm:inline">
                {user?.firstName} {user?.lastName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="flex items-center gap-2 text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Odjava
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
