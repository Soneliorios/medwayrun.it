"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { createClient, createRawClient } from "@/lib/supabase/client";
import { useBoardStore } from "../store/boardStore";
import { useFilterStore } from "../store/filterStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { applyBoardFilters } from "@/lib/filterUtils";
import { useBoardDnd } from "../hooks/useBoardDnd";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCardOverlay } from "./TaskCardOverlay";
import { cn, ORG_ID, getPositionBetween } from "@/lib/utils";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  projectId: string;
  onTaskOpen: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
}

const DEFAULT_COLUMNS = ["A fazer", "Em andamento", "Revisão", "Concluído"];

export function KanbanBoard({ projectId, onTaskOpen, onAddTask }: Props) {
  const store = useBoardStore();
  const filters = useFilterStore((s) => s.filters);
  const activeTimerTaskId = useTimerStore((s) => s.activeTaskId);
  const currentUserId = useAuthStore((s) => s.profile?.id ?? null);
  const { sensors, handleDragStart, handleDragOver, handleDragEnd } = useBoardDnd();
  const [addingColumn, setAddingColumn] = useState(false);

  useEffect(() => {
    loadBoard(projectId);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBoard(pid: string) {
    store.setLoading(true);

    const supabase = createClient();

    const { data: columnsData } = await supabase
      .from("columns")
      .select("*")
      .eq("project_id", pid)
      .order("position", { ascending: true });

    if (!columnsData || columnsData.length === 0) {
      // Create default columns for new project
      await createDefaultColumns(pid);
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

    if (tasksError) console.error("[loadBoard] tasks error:", tasksError);

    const tasksByColumn = new Map<string, TaskWithRelations[]>();
    ((tasksData ?? []) as any[]).forEach((t: any) => {
      const tasks = tasksByColumn.get(t.column_id) ?? [];
      const processed: TaskWithRelations = {
        ...t,
        assignee: t.assignee ?? null,
        labels: (t.labels as any[])?.map((tl: any) => tl.labels).filter(Boolean) ?? [],
        _commentCount: (t._commentCount?.[0]?.count as number) ?? 0,
      };
      tasks.push(processed);
      tasksByColumn.set(t.column_id, tasks);
    });

    const columns: ColumnWithTasks[] = ((columnsData ?? []) as any[]).map((col: any) => ({
      ...col,
      tasks: tasksByColumn.get(col.id) ?? [],
    }));

    store.setColumns(columns);
    store.setLoading(false);
  }

  async function createDefaultColumns(pid: string) {
    const supabase = createRawClient();
    const insertData = DEFAULT_COLUMNS.map((name, i) => ({
      project_id: pid,
      name,
      position: (i + 1) * 1000,
      is_done_column: i === DEFAULT_COLUMNS.length - 1,
    }));

    const { data } = await supabase
      .from("columns")
      .insert(insertData)
      .select();

    const columns: ColumnWithTasks[] = (data ?? []).map((col: any) => ({
      ...col,
      tasks: [],
    }));
    store.setColumns(columns);
    store.setLoading(false);
  }

  async function handleAddColumn() {
    setAddingColumn(true);
    const lastPosition =
      store.columns.length > 0
        ? store.columns[store.columns.length - 1].position
        : 0;

    const supabase = createRawClient();
    const { data } = await supabase
      .from("columns")
      .insert({
        project_id: projectId,
        name: "Nova coluna",
        position: lastPosition + 1000,
      })
      .select()
      .single();

    if (data) {
      store.addColumn({ ...(data as any), tasks: [] });
    }
    setAddingColumn(false);
  }

  // Find the actively dragged task for the overlay
  const activeTask = store.activeTaskId
    ? store.columns.flatMap((c) => c.tasks).find((t) => t.id === store.activeTaskId)
    : null;

  const columnIds = store.columns.map((c) => c.id);

  // Apply active filters for display only — DnD continues to operate on the
  // full store data, so dragging/reordering still works while filtered.
  const displayColumns = applyBoardFilters(store.columns, filters, {
    activeTimerTaskId,
    currentUserId,
  });

  if (store.isLoading) {
    return (
      <div className="flex gap-4 p-6 overflow-x-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            {Array.from({ length: 3 + i % 2 }).map((_, j) => (
              <Skeleton key={j} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      measuring={{
        droppable: { strategy: MeasuringStrategy.Always },
      }}
    >
      <div className="kanban-scroll flex gap-4 p-6 h-full items-start pb-8">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {displayColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onTaskOpen={onTaskOpen}
              onAddTask={onAddTask}
            />
          ))}
        </SortableContext>

        {/* Add column button */}
        <button
          onClick={handleAddColumn}
          disabled={addingColumn}
          className={cn(
            "w-64 shrink-0 h-11 rounded-xl border-2 border-dashed border-neutral-200",
            "flex items-center justify-center gap-1.5",
            "text-sm text-neutral-400 hover:text-brand-navy hover:border-brand-navy/30",
            "hover:bg-white transition-all"
          )}
        >
          <Plus size={14} />
          Nova coluna
        </button>
      </div>

      {/* Drag overlay — renders the "ghost" card that follows the cursor */}
      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
