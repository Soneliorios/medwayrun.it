"use client";

import { useEffect, useState } from "react";
import { IS_MOCK } from "@/lib/mockDb";
import { getMockRole, can, type AppRole, type Permission } from "@/lib/roles";
import { useAuthStore } from "../store/authStore";

export function useRole() {
  const member = useAuthStore((s) => s.member);

  const [mockRole, setMockRole] = useState<AppRole>(() =>
    IS_MOCK ? getMockRole() : "user"
  );

  useEffect(() => {
    if (!IS_MOCK) return;
    const handler = () => setMockRole(getMockRole());
    window.addEventListener("mwr_role_change", handler);
    return () => window.removeEventListener("mwr_role_change", handler);
  }, []);

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
