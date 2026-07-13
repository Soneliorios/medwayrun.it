import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import type { TaskWithRelations, InsertTask } from "@/types";

export const taskService = {
  async get(id: string): Promise<TaskWithRelations | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
        labels:task_labels(labels(*)),
        checklist_items(*),
        _commentCount:comments(count)
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null; // não existe ou está na Lixeira

    return {
      ...(data as any),
      labels:
        ((data as any).labels as any[])
          ?.map((tl: any) => tl.labels)
          .filter(Boolean) ?? [],
      _commentCount: ((data as any)._commentCount?.[0]?.count as number) ?? 0,
    } as unknown as TaskWithRelations;
  },

  async create(input: {
    project_id: string;
    column_id: string;
    title: string;
    description?: string;
    priority?: TaskWithRelations["priority"];
    assignee_id?: string;
    due_date?: string;
    position?: number;
  }): Promise<TaskWithRelations> {
    const supabase = createRawClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...input, org_id: ORG_ID })
      .select()
      .single();

    if (error) {
      console.error("[taskService.create] insert error:", error);
      throw error;
    }
    return data as unknown as TaskWithRelations;
  },

  async update(id: string, updates: Partial<TaskWithRelations>): Promise<void> {
    const supabase = createRawClient();
    // Send only keys that were explicitly provided (strip undefined, keep null)
    const payload = Object.fromEntries(
      Object.entries(updates as Record<string, unknown>).filter(([, v]) => v !== undefined)
    );
    const { error } = await supabase.from("tasks").update(payload).eq("id", id);
    if (error) throw error;
  },

  /** Soft delete: manda a task para a Lixeira (recuperável por 7 dias). */
  async delete(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },

  /** Restaura uma task da Lixeira. */
  async restore(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase.from("tasks").update({ deleted_at: null }).eq("id", id);
    if (error) throw error;
  },

  /** Exclusão PERMANENTE (hard delete) — usada na Lixeira ("excluir de vez"). */
  async purge(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  },

  /** Tarefas apagadas de um quadro nos últimos 7 dias (para a Lixeira). */
  async listDeleted(boardId: string): Promise<TaskWithRelations[]> {
    const supabase = createClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tasks")
      .select(`*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)`)
      .eq("project_id", boardId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false });
    if (error) { console.error("[taskService.listDeleted]", error); return []; }
    return (data ?? []) as unknown as TaskWithRelations[];
  },

  async getComments(taskId: string) {
    const supabase = createClient();
    // No profiles embed — comments.user_id FKs auth.users, not profiles, so the
    // embed 400s (PGRST200). Names are resolved client-side from org members.
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async addComment(taskId: string, userId: string, content: string) {
    const supabase = createRawClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ task_id: taskId, user_id: userId, content })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async deleteComment(commentId: string) {
    const supabase = createRawClient();
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) throw error;
  },

  async updateChecklist(itemId: string, isDone: boolean) {
    const supabase = createRawClient();
    const { error } = await supabase
      .from("checklist_items")
      .update({ is_done: isDone })
      .eq("id", itemId);
    if (error) throw error;
  },

  async addChecklistItem(taskId: string, title: string, position: number) {
    const supabase = createRawClient();
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({ task_id: taskId, title, position })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteChecklistItem(itemId: string) {
    const supabase = createRawClient();
    const { error } = await supabase
      .from("checklist_items")
      .delete()
      .eq("id", itemId);
    if (error) throw error;
  },
};
