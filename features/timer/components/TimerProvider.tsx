"use client";

import { useEffect } from "react";
import { useTimerStore } from "../store/timerStore";
import { useAuthStore } from "@/features/auth/store/authStore";

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { isRunning, tick, loadActiveTimer } = useTimerStore();

  // Load active timer from DB on mount
  useEffect(() => {
    if (user?.id) {
      loadActiveTimer(user.id);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every second when running
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, tick]);

  return <>{children}</>;
}
