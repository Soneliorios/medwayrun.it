"use client";

import { IS_MOCK } from "@/lib/mockDb";
import { can, type AppRole, type Permission } from "@/lib/roles";
import { useAuthStore } from "../store/authStore";

export function useRole() {
  const member = useAuthStore((s) => s.member);
  const profile = useAuthStore((s) => s.profile);

  // In mock mode, role comes from the MockUser stored in the auth store profile.
  // (profile is populated by useAuthListener from the logged-in MockUser.)
  const mockRole: AppRole = (() => {
    if (!IS_MOCK) return "user";
    const r = (profile as any)?.role as string | undefined;
    if (r === "superadmin" || r === "admin" || r === "user") return r;
    return "user";
  })();

  const role: AppRole = IS_MOCK
    ? mockRole
    : ((member?.role === "owner" ? "superadmin" : member?.role === "admin" ? "admin" : "user") as AppRole);

  return {
    role,
    isSuperAdmin: role === "superadmin",
    isAdmin: role === "admin" || role === "superadmin",
    isUser: role === "user",
    can: (permission: Permission) => can(role, permission),
  };
}
