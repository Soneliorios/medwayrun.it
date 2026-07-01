import { createRawClient } from "@/services/supabase/client";
import { IS_MOCK, mockTimers, mockTasks, mockTimeEntries } from "@/lib/mockDb";

export const timerService = {
  async start(userId: string, taskId: string): Promise<{ started_at: string }> {
    if (IS_MOCK) {
      const timer = mockTimers.start(userId, taskId);
      return { started_at: timer.started_at };
    }

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
    if (IS_MOCK) {
      const active = mockTimers.get(userId);
      if (!active) return null;
      // Use seconds precision: even a 1-second session counts
      const durationSeconds = Math.ceil((Date.now() - new Date(active.started_at).getTime()) / 1000);
      const durationMinutes = Math.max(1, Math.round(durationSeconds / 60)); // minimum 1 minute for display
      const durationHours = durationSeconds / 3600; // exact hours from seconds
      mockTimers.stop(userId);
      // Update tracked_hours on the task + record a time entry for the timesheet
      if (durationSeconds >= 1) {
        const task = mockTasks.get(active.task_id);
        if (task) {
          mockTasks.update(active.task_id, {
            tracked_hours: (task.tracked_hours ?? 0) + durationHours,
          });
        }
        mockTimeEntries.add(
          userId,
          active.task_id,
          durationMinutes,
          new Date(active.started_at).toISOString().slice(0, 10),
          "Cronômetro"
        );
      }
      return durationMinutes;
    }

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
    if (IS_MOCK) {
      return mockTimers.get(userId);
    }

    const supabase = createRawClient();
    const { data } = await supabase
      .from("active_timers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },
};
