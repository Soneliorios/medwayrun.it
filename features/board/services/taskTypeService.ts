import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import { DEFAULT_BOARD_TYPES, type BoardTaskType } from "@/lib/liquidTime";

/**
 * Board task types, backed by the `task_types` table (project-scoped).
 * Replaces the old localStorage-only model so types sync across devices,
 * origins and users. Display everywhere still uses the denormalized
 * `tasks.task_type` text; this service only owns the list of options.
 */
export const taskTypeService = {
  async list(projectId: string): Promise<BoardTaskType[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_types")
      .select("id, name, color, default_hours")
      .eq("project_id", projectId)
      .order("name", { ascending: true });
    if (error) {
      console.error("[taskTypeService.list]", error);
      return [];
    }
    return (data ?? []).map((t: any) => ({
      id: t.id as string,
      name: t.name as string,
      color: (t.color as string) ?? "#407EC9",
      default_hours: (t.default_hours as number) ?? 0,
    }));
  },

  async create(
    projectId: string,
    input: { name: string; color?: string; default_hours?: number }
  ): Promise<BoardTaskType | null> {
    const name = input.name.trim();
    if (!name) return null;
    const supabase = createRawClient();
    const { data, error } = await supabase
      .from("task_types")
      .insert({
        org_id: ORG_ID,
        project_id: projectId,
        name,
        color: input.color ?? "#407EC9",
        default_hours: input.default_hours ?? 2,
      })
      .select("id, name, color, default_hours")
      .single();
    if (error) {
      console.error("[taskTypeService.create]", error);
      return null;
    }
    return data as unknown as BoardTaskType;
  },

  async remove(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase.from("task_types").delete().eq("id", id);
    if (error) console.error("[taskTypeService.remove]", error);
  },

  /**
   * Seed the standard default types for a board. Called ONCE when a brand-new
   * board is initialized (see loadBoardData). Never called on normal loads, so
   * types the user deletes stay deleted — no resurrection. Idempotent via the
   * (project_id, name) unique index.
   */
  async seedDefaults(projectId: string): Promise<void> {
    const supabase = createRawClient();
    const rows = DEFAULT_BOARD_TYPES.map((t) => ({
      org_id: ORG_ID,
      project_id: projectId,
      name: t.name,
      color: t.color ?? "#407EC9",
      default_hours: t.default_hours ?? 2,
    }));
    const { error } = await supabase
      .from("task_types")
      .upsert(rows, { onConflict: "project_id,name", ignoreDuplicates: true });
    if (error) console.error("[taskTypeService.seedDefaults]", error);
  },
};
