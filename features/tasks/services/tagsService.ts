import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface Label {
  id: string;
  name: string;
  color: string;
}

const PALETTE = ["#01CFB5", "#407EC9", "#AC145A", "#FFB81C", "#3B3FB6", "#00205B", "#52575C"];

export const tagsService = {
  /** Board-scoped labels (project_id = board). */
  async listForBoard(boardId: string): Promise<Label[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("labels")
      .select("id, name, color")
      .eq("project_id", boardId)
      .order("name");
    if (error) { console.error("[tagsService.listForBoard]", error); return []; }
    return (data ?? []) as Label[];
  },

  /** Labels attached to a task. */
  async listForTask(taskId: string): Promise<Label[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_labels")
      .select("labels(id, name, color)")
      .eq("task_id", taskId);
    if (error) { console.error("[tagsService.listForTask]", error); return []; }
    return ((data ?? []) as any[]).map((r) => r.labels).filter(Boolean) as Label[];
  },

  /** Find an existing board label by name or create it, then return it. */
  async ensureLabel(boardId: string, name: string): Promise<Label | null> {
    const sb = createRawClient();
    const trimmed = name.trim();
    const { data: existing } = await (sb as any)
      .from("labels")
      .select("id, name, color")
      .eq("project_id", boardId)
      .ilike("name", trimmed)
      .maybeSingle();
    if (existing) return existing as Label;
    const color = PALETTE[trimmed.length % PALETTE.length];
    const { data, error } = await (sb as any)
      .from("labels")
      .insert({ org_id: ORG_ID, project_id: boardId, name: trimmed, color })
      .select("id, name, color")
      .single();
    if (error) { console.error("[tagsService.ensureLabel]", error); return null; }
    return data as Label;
  },

  async attach(taskId: string, labelId: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_labels").insert({ task_id: taskId, label_id: labelId });
    if (error && error.code !== "23505") { console.error("[tagsService.attach]", error); return false; }
    return true;
  },

  async detach(taskId: string, labelId: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_labels").delete().eq("task_id", taskId).eq("label_id", labelId);
    if (error) { console.error("[tagsService.detach]", error); return false; }
    return true;
  },
};
