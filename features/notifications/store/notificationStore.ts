"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface AppNotification {
  id: string;
  type: "mention" | "task_assigned" | "task_delivered" | "comment" | "approval_requested" | "approval_resolved" | "capacity_overflow";
  content: string;
  task_id: string | null;
  from_user_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;

  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notification: AppNotification) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()(
  subscribeWithSelector((set) => ({
    notifications: [],
    unreadCount: 0,

    setNotifications: (notifications) =>
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read_at).length,
      }),

    addNotification: (notification) =>
      set((s) => ({
        notifications: [notification, ...s.notifications],
        unreadCount: s.unreadCount + (notification.read_at ? 0 : 1),
      })),

    markRead: (id) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      })),

    markAllRead: () =>
      set((s) => ({
        notifications: s.notifications.map((n) => ({
          ...n,
          read_at: n.read_at ?? new Date().toISOString(),
        })),
        unreadCount: 0,
      })),
  }))
);
