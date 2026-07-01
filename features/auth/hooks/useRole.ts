"use client";

import { can, type AppRole, type Permission } from "@/lib/roles";
import { useAuthStore } from "../store/authStore";

export function useRole() {
  const member = useAuthStore((s) => s.member);

  const role: AppRole = (member?.role === "owner" ? "superadmin" : member?.role === "admin" ? "admin" : "user") as AppRole;

  return {
    role,
    isSuperAdmin: role === "superadmin",
    isAdmin: role === "admin" || role === "superadmin",
    isUser: role === "user",
    can: (permission: Permission) => can(role, permission),
  };
}
