"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";
import { getPositionBetween } from "@/lib/utils";

interface BoardState {
  columns: ColumnWithTasks[];
  activeTaskId: string | null;
  isLoading: boolean;

  setColumns: (columns: ColumnWithTasks[]) => void;
  setLoading: (loading: boolean) => void;
  setActiveTask: (id: string | null) => void;

  // Optimistic task movement (drag & drop)
  moveTask: (taskId: string, toColumnId: string, newPosition: number) => void;

  // Optimistic task insert
  addTask: (columnId: string, task: TaskWithRelations) => void;

  // Optimistic task update
  updateTask: (taskId: string, updates: Partial<TaskWithRelations>) => void;

  // Remove task
  removeTask: (taskId: string) => void;

  // Column mutations
  addColumn: (column: ColumnWithTasks) => void;
  updateColumn: (columnId: string, updates: { name?: string; color?: string }) => void;
  removeColumn: (columnId: string) => void;

  // Reorder columns
  moveColumn: (fromId: string, toId: string) => void;
}

export const useBoardStore = create<BoardState>()(
  subscribeWithSelector((set, get) => ({
    columns: [],
    activeTaskId: null,
    isLoading: false,

    setColumns: (columns) => set({ columns }),
    setLoading: (isLoading) => set({ isLoading }),
    setActiveTask: (id) => set({ activeTaskId: id }),

    moveTask: (taskId, toColumnId, newPosition) =>
      set((state) => {
        const columns = state.columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== taskId),
        }));

        const task = state.columns
          .flatMap((c) => c.tasks)
          .find((t) => t.id === taskId);

        if (!task) return state;

        const updatedTask: TaskWithRelations = {
          ...task,
          column_id: toColumnId,
          position: newPosition,
        };

        return {
          columns: columns.map((col) =>
            col.id === toColumnId
              ? {
                  ...col,
                  tasks: [...col.tasks, updatedTask].sort(
                    (a, b) => a.position - b.position
                  ),
                }
              : col
          ),
        };
      }),

    addTask: (columnId, task) =>
      set((state) => ({
        columns: state.columns.map((col) =>
          col.id === columnId
            ? { ...col, tasks: [...col.tasks, task] }
            : col
        ),
      })),

    updateTask: (taskId, updates) =>
      set((state) => ({
        columns: state.columns.map((col) => ({
          ...col,
          tasks: col.tasks.map((t) =>
            t.id === taskId ? { ...t, ...updates } : t
          ),
        })),
      })),

    removeTask: (taskId) =>
      set((state) => ({
        columns: state.columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== taskId),
        })),
      })),

    addColumn: (column) =>
      set((state) => ({ columns: [...state.columns, column] })),

    updateColumn: (columnId, updates) =>
      set((state) => ({
        columns: state.columns.map((col) =>
          col.id === columnId ? { ...col, ...updates } : col
        ),
      })),

    removeColumn: (columnId) =>
      set((state) => ({
        columns: state.columns.filter((col) => col.id !== columnId),
      })),

    moveColumn: (fromId, toId) =>
      set((state) => {
        const cols = [...state.columns];
        const fromIdx = cols.findIndex((c) => c.id === fromId);
        const toIdx = cols.findIndex((c) => c.id === toId);
        if (fromIdx === -1 || toIdx === -1) return state;
        const [moved] = cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, moved);
        return { columns: cols };
      }),
  }))
);

/** Get position for dropping a task at a specific index in a column */
export function getDropPosition(
  tasks: TaskWithRelations[],
  overIndex: number,
  isEnd: boolean
): number {
  if (tasks.length === 0) return 1000;
  if (isEnd) {
    const last = tasks[tasks.length - 1];
    return last.position + 1000;
  }
  const before = overIndex > 0 ? tasks[overIndex - 1].position : null;
  const after = tasks[overIndex]?.position ?? null;
  return getPositionBetween(before, after);
}
