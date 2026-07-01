"use client";

import { useAuthListener } from "../hooks/useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuthListener();
  return <>{children}</>;
}
