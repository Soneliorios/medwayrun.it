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
import { createRawClient } from "@/lib/supabase/client";
import { useBoardStore } from "../store/boardStore";
import { useFilterStore } from "../store/filterStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { applyBoardFilters } from "@/lib/filterUtils";
import { useBoardDnd } from "../hooks/useBoardDnd";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCardOverlay } from "./TaskCardOverlay";
import { cn, ORG_ID, getPositionBetween } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  projectId: string;
  onTaskOpen: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
}


export function KanbanBoard({ projectId, onTaskOpen, onAddTask }: Props) {
  const store = useBoardStore();
  const filters = useFilterStore((s) => s.filters);
  const activeTimerTaskId = useTimerStore((s) => s.activeTaskId);
  const currentUserId = useAuthStore((s) => s.profile?.id ?? null);
  const { sensors, handleDragStart, handleDragOver, handleDragEnd } = useBoardDnd();
  const [addingColumn, setAddingColumn] = useState(false);

  // Board data is loaded at the page level via useBoardData so every view
  // (Kanban, Dashboard, List, Gantt) has data regardless of the active tab.

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
