import { createRawClient } from "@/lib/supabase/client";

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
};
