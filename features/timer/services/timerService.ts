import { createRawClient } from "@/lib/supabase/client";

export const timerService = {
  async start(userId: string, taskId: string): Promise<{ started_at: string }> {
    const supabase = createRawClient();
    const existing = await this.getActive(userId);
    if (existing) {
      await this.stop(userId);
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("active_timers")
      .upsert({ user_id: userId, task_id: taskId, started_at: now });

    if (error) throw error;
    return { started_at: now };
  },

  async stop(userId: string): Promise<number | null> {
    const supabase = createRawClient();
    const active = await this.getActive(userId);
    if (!active) return null;

    const startedAt = new Date(active.started_at);
    const endedAt = new Date();
    const durationMinutes = Math.round(
      (endedAt.getTime() - startedAt.getTime()) / 60000
    );

    await supabase.from("time_entries").insert({
      task_id: active.task_id,
      user_id: userId,
      started_at: active.started_at,
      ended_at: endedAt.toISOString(),
      duration_minutes: durationMinutes,
    });

    if (durationMinutes > 0) {
      try {
        const { data: taskData } = await supabase
          .from("tasks")
          .select("tracked_hours")
          .eq("id", active.task_id)
          .single();
        if (taskData) {
          await supabase
            .from("tasks")
            .update({ tracked_hours: (taskData as any).tracked_hours + durationMinutes / 60 })
            .eq("id", active.task_id);
        }
      } catch {}
    }

    await supabase.from("active_timers").delete().eq("user_id", userId);
    return durationMinutes;
  },

  async getActive(userId: string) {
    const supabase = createRawClient();
    const { data } = await supabase
      .from("active_timers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },
};
