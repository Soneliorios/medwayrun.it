"use client";

import { Bell, Search, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSignOut } from "@/features/auth/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export function Header({ title, children }: HeaderProps) {
  const { profile } = useAuthStore();
  const signOut = useSignOut();

  return (
    <header className="h-14 flex items-center gap-4 px-6 border-b border-neutral-100 bg-white shrink-0">
      {title && (
        <h1 className="text-base font-semibold text-brand-navy mr-2">{title}</h1>
      )}

      {children}

      <div className="ml-auto flex items-center gap-2">
        {/* Search trigger */}
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-neutral-500 hover:text-brand-navy hover:bg-neutral-100"
        >
          <Search size={16} />
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-neutral-500 hover:text-brand-navy hover:bg-neutral-100 relative"
        >
          <Bell size={16} />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none rounded-full ring-2 ring-transparent hover:ring-brand-teal transition-all">
            <Avatar className="w-7 h-7 cursor-pointer">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-brand-navy text-white text-xs">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-brand-navy">
                {profile?.full_name ?? "Usuário"}
              </p>
              <p className="text-xs text-neutral-500">Medway</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut size={14} className="mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
