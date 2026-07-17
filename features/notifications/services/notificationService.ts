import { createClient, createRawClient } from "@/lib/supabase/client";
import type { AppNotification } from "../store/notificationStore";

type NotificationType = AppNotification["type"];

/**
 * Notifications backed by the `notifications` table. Persisted + delivered
 * across users (RLS allows inserting for any org member — see
 * supabase_approvals_notifications.sql) and streamed via realtime.
 */
export const notificationService = {
  async list(userId: string): Promise<AppNotification[]> {
    const sb = createClient();
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[notificationService.list]", error);
      return [];
    }
    return (data ?? []) as unknown as AppNotification[];
  },

  /** Create a notification for a target user (usually someone else). */
  async create(input: {
    userId: string;
    type: NotificationType;
    content: string;
    taskId?: string | null;
    fromUserId?: string | null;
  }): Promise<void> {
    if (!input.userId) return;
    const sb = createRawClient();
    const { error } = await sb.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      content: input.content,
      task_id: input.taskId ?? null,
      from_user_id: input.fromUserId ?? null,
    });
    if (error) { console.error("[notificationService.create]", error); return; }
    // Espelho opcional no Slack: a rota só envia se o DESTINATÁRIO ativou a
    // preferência (respectPref). Fire-and-forget — nunca bloqueia a notificação.
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const link = input.taskId && origin ? `\n${origin}/tasks/${input.taskId}` : "";
      void fetch("/api/slack/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [input.userId], text: `🔔 ${input.content}${link}`, respectPref: true }),
      }).catch(() => {});
    } catch { /* ignore */ }
  },

  async markRead(id: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("[notificationService.markRead]", error);
  },

  async markAllRead(userId: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) console.error("[notificationService.markAllRead]", error);
  },
};
