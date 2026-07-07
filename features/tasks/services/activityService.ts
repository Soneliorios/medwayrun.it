import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export const activityService = {
  async list(taskId: string): Promise<TaskActivity[]> {
    const supabase = createRawClient();
    const { data, error } = await (supabase as any)
      .from("task_activity")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[activityService.list] error:", error);
      return [];
    }
    return (data ?? []) as TaskActivity[];
  },

  /**
   * Append an event to a task's history. Used for things the DB trigger doesn't
   * cover (e.g. approval requests/resolutions). Requires the task_activity
   * INSERT policy — see supabase_approvals_notifications.sql.
   */
  async log(input: {
    taskId: string;
    userId: string | null;
    userName: string | null;
    action: string;
    field?: string | null;
    fromValue?: string | null;
    toValue?: string | null;
  }): Promise<void> {
    const supabase = createRawClient();
    const { error } = await (supabase as any).from("task_activity").insert({
      task_id: input.taskId,
      org_id: ORG_ID,
      user_id: input.userId,
      user_name: input.userName,
      action: input.action,
      field: input.field ?? null,
      from_value: input.fromValue ?? null,
      to_value: input.toValue ?? null,
    });
    if (error) console.error("[activityService.log] error:", error);
  },
};
