import { createRawClient } from "@/lib/supabase/client";

/**
 * Per-user preferences backed by the `user_settings` table (see
 * supabase_user_settings.sql). Replaces localStorage-based settings.
 */
export const userSettingsService = {
  async getTimesheetGoal(userId: string): Promise<number | null> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("user_settings")
      .select("timesheet_goal_hours")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[userSettingsService.getTimesheetGoal]", error);
      return null;
    }
    return (data?.timesheet_goal_hours as number) ?? null;
  },

  async setTimesheetGoal(userId: string, hours: number): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("user_settings")
      .upsert({ user_id: userId, timesheet_goal_hours: hours, updated_at: new Date().toISOString() });
    if (error) console.error("[userSettingsService.setTimesheetGoal]", error);
  },

  /** Meta SEMANAL (h) do usuário. null = não configurada (usa diária × 5 dias). */
  async getTimesheetWeeklyGoal(userId: string): Promise<number | null> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("user_settings")
      .select("weekly_goal_hours")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { console.error("[userSettingsService.getTimesheetWeeklyGoal]", error); return null; }
    const v = data?.weekly_goal_hours as number | null | undefined;
    return v == null ? null : Number(v);
  },

  async setTimesheetWeeklyGoal(userId: string, hours: number | null): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("user_settings")
      .upsert({ user_id: userId, weekly_goal_hours: hours, updated_at: new Date().toISOString() });
    if (error) console.error("[userSettingsService.setTimesheetWeeklyGoal]", error);
  },
};
