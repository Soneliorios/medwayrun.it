"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useNotificationStore, type AppNotification } from "../store/notificationStore";
import { notificationService } from "../services/notificationService";

/**
 * Loads the current user's notifications from the DB into the store and keeps
 * them live via realtime. Mounted once in the dashboard layout. Without this
 * the bell would only ever show ephemeral, in-memory notifications.
 */
export function NotificationProvider({ children }: { children?: React.ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    notificationService.list(userId).then((rows) => {
      if (!cancelled) setNotifications(rows);
    });

    const channel = supabaseRef.current
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => addNotification(payload.new as unknown as AppNotification)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabaseRef.current.removeChannel(channel);
    };
  }, [userId, setNotifications, addNotification]);

  return <>{children}</>;
}
