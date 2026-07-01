import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import type { TaskWithRelations, InsertTask } from "@/types";

export const taskService = {
  async get(id: string): Promise<TaskWithRelations> {
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
      .single();

    if (error) throw error;

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

    if (error) throw error;
    return data as unknown as TaskWithRelations;
  },

  async update(id: string, updates: Partial<TaskWithRelations>): Promise<void> {
    const supabase = createRawClient();
    const {
      title, description, priority, assignee_id, due_date,
      estimated_hours, is_urgent, status, delivery_date,
    } = updates as any;
    const { error } = await supabase
      .from("tasks")
      .update({
        title, description, priority, assignee_id, due_date,
        estimated_hours, is_urgent, status, delivery_date,
      })
      .eq("id", id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  },

  async getComments(taskId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles(id, full_name, avatar_url)")
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
      .select("*, profiles(id, full_name, avatar_url)")
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
