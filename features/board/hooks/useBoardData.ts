"use client";

import { useEffect } from "react";
import { createClient, createRawClient } from "@/lib/supabase/client";
import { useBoardStore } from "../store/boardStore";
import { taskTypeService } from "../services/taskTypeService";
import { resolveEstimatedHours } from "@/lib/liquidTime";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";

const DEFAULT_COLUMNS = ["A fazer", "Em andamento", "Revisão", "Concluído"];

/**
 * Loads a board's columns + tasks into the board store. Shared so it runs at the
 * page level regardless of which view tab is active — previously this lived only
 * inside KanbanBoard, so Dashboard/List/Gantt showed empty data when opened
 * without the Kanban tab having mounted first.
 */
export async function loadBoardData(pid: string) {
  const store = useBoardStore.getState();
  store.setLoading(true);

  const supabase = createClient();
  const { data: columnsData } = await supabase
    .from("columns")
    .select("*")
    .eq("project_id", pid)
    .order("position", { ascending: true });

  if (!columnsData || columnsData.length === 0) {
    // Create default columns for a brand-new board
    const rawClient = createRawClient();
    const insertData = DEFAULT_COLUMNS.map((name, i) => ({
      project_id: pid,
      name,
      position: (i + 1) * 1000,
      is_done_column: i === DEFAULT_COLUMNS.length - 1,
    }));
    const { data } = await rawClient.from("columns").insert(insertData).select();
    const columns: ColumnWithTasks[] = (data ?? []).map((col: any) => ({ ...col, tasks: [] }));
    // Brand-new board: seed the default task types once (the only place types
    // are auto-created — normal loads never re-seed, so deletions stick).
    await taskTypeService.seedDefaults(pid);
    store.setColumns(columns);
    store.setLoading(false);
    return;
  }

  const rawClient = createRawClient();
  const { data: tasksData, error: tasksError } = await rawClient
    .from("tasks")
    .select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
      labels:task_labels(labels(*)),
      _commentCount:comments(count)
    `)
    .eq("project_id", pid)
    .order("position", { ascending: true });

  if (tasksError) console.error("[loadBoardData] tasks error:", tasksError);

  // Responsible queue per task (so cards can show the whole queue in order)
  const taskIds = ((tasksData ?? []) as any[]).map((t: any) => t.id);
  const seqByTask = new Map<string, any[]>();
  if (taskIds.length > 0) {
    const { data: seqData } = await (rawClient as any)
      .from("task_sequences")
      .select("task_id, user_id, order_position, status")
      .in("task_id", taskIds)
      .order("order_position");
    ((seqData ?? []) as any[]).forEach((s) => {
      const arr = seqByTask.get(s.task_id) ?? [];
      arr.push(s);
      seqByTask.set(s.task_id, arr);
    });
  }

  // Board task types → estimate map, so tasks without an explicit estimate
  // inherit their type's estimated hours ("follow the type" behavior).
  const boardTypes = await taskTypeService.list(pid);
  const hoursByType = new Map(boardTypes.map((t) => [t.name, t.default_hours]));

  const tasksByColumn = new Map<string, TaskWithRelations[]>();
  ((tasksData ?? []) as any[]).forEach((t: any) => {
    const tasks = tasksByColumn.get(t.column_id) ?? [];
    tasks.push({
      ...t,
      estimated_hours: resolveEstimatedHours(t.estimated_hours, t.task_type, hoursByType),
      assignee: t.assignee ?? null,
      labels: (t.labels as any[])?.map((tl: any) => tl.labels).filter(Boolean) ?? [],
      _commentCount: (t._commentCount?.[0]?.count as number) ?? 0,
      sequence: seqByTask.get(t.id) ?? [],
    } as TaskWithRelations);
    tasksByColumn.set(t.column_id, tasks);
  });

  const columns: ColumnWithTasks[] = (columnsData as any[]).map((col: any) => ({
    ...col,
    tasks: tasksByColumn.get(col.id) ?? [],
  }));

  store.setColumns(columns);
  store.setLoading(false);
}

/** Load board data on mount / when the board id changes, for any view. */
export function useBoardData(boardId: string) {
  useEffect(() => {
    if (boardId) loadBoardData(boardId);
  }, [boardId]);
}
