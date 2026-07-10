"use client";

import { useCallback, useRef } from "react";
import type { DragStartEvent, DragOverEvent, DragEndEvent } from "@dnd-kit/core";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createRawClient } from "@/lib/supabase/client";
import { useBoardStore, getDropPosition } from "../store/boardStore";
import { runAutomations } from "@/lib/automationEngine";
import { useRole } from "@/features/auth/hooks/useRole";
import { useAuthStore } from "@/features/auth/store/authStore";

export function useBoardDnd() {
  const store = useBoardStore();
  const supabase = createRawClient();
  const { isUser } = useRole();
  const { user } = useAuthStore();

  // Track original state for rollback on error
  const snapshotRef = useRef<typeof store.columns | null>(null);
  // Track whether the current drag is allowed (role check at drag start)
  const dragAllowedRef = useRef(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Activation constraint prevents accidental drags when clicking
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;

      // Role check: a "user" can drag (change the stage of) a task if they are
      // a responsible for it — the current assignee OR anyone in its queue.
      if (isUser) {
        const task = store.columns.flatMap((c) => c.tasks).find((t) => t.id === id);
        const isAssignee = (task as any)?.assignee_id === user?.id;
        const inQueue = ((task as any)?.sequence ?? []).some(
          (s: any) => s.user_id === user?.id
        );
        if (!isAssignee && !inQueue) {
          dragAllowedRef.current = false;
          return;
        }
      }

      dragAllowedRef.current = true;
      store.setActiveTask(id);
      // Snapshot current state for rollback
      snapshotRef.current = store.columns;
    },
    [store, isUser, user]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!dragAllowedRef.current) return;
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Find which column the active task is currently in
      const activeColumn = store.columns.find((col) =>
        col.tasks.some((t) => t.id === activeId)
      );

      if (!activeColumn) return;

      // Determine the target column: either it's a column ID or a task ID
      const overColumn =
        store.columns.find((col) => col.id === overId) ??
        store.columns.find((col) => col.tasks.some((t) => t.id === overId));

      if (!overColumn || activeColumn.id === overColumn.id) return;

      // Moving to a different column — find position
      const overTaskIndex = overColumn.tasks.findIndex((t) => t.id === overId);
      const newPosition = getDropPosition(
        overColumn.tasks,
        overTaskIndex >= 0 ? overTaskIndex : overColumn.tasks.length,
        overTaskIndex < 0
      );

      store.moveTask(activeId, overColumn.id, newPosition);
    },
    [store]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      store.setActiveTask(null);
      if (!dragAllowedRef.current) return;

      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Find the final state of the task after all drag-over updates
      const column = store.columns.find((col) =>
        col.tasks.some((t) => t.id === activeId)
      );

      if (!column) return;

      // Did the drag change the task's column (stage)? Compare against the
      // pre-drag snapshot so we only fire "stage_entered" on a real move.
      const originColId = snapshotRef.current?.find((c) => c.tasks.some((t) => t.id === activeId))?.id;
      const stageChanged = !!originColId && originColId !== column.id;

      const tasks = [...column.tasks].sort((a, b) => a.position - b.position);
      const taskIndex = tasks.findIndex((t) => t.id === activeId);

      // Dropping into the "done"/last column triggers the delivery flow: roll the
      // move back and open the delivery popup — the card only lands (and stays) in
      // Concluído if the delivery is confirmed there.
      const sortedCols = [...store.columns].sort((a, b) => a.position - b.position);
      const doneCol = store.columns.find((c) => (c as any).is_done_column) ?? sortedCols[sortedCols.length - 1];
      const movedTask = column.tasks.find((t) => t.id === activeId);
      if (stageChanged && doneCol && column.id === doneCol.id && (movedTask as any)?.status !== "delivered") {
        if (snapshotRef.current) store.setColumns(snapshotRef.current); // desfaz o move otimista
        window.dispatchEvent(new CustomEvent("open-task-delivery", { detail: { taskId: activeId } }));
        return;
      }

      // If dropped on same task (no-op) and same column
      if (activeId === overId) {
        // Check if same column — recalculate within column
        const before = taskIndex > 0 ? tasks[taskIndex - 1].position : null;
        const after =
          taskIndex < tasks.length - 1
            ? tasks[taskIndex + 1].position
            : null;
        const position = getDropPosition(
          tasks.filter((_, i) => i !== taskIndex),
          taskIndex,
          taskIndex >= tasks.length - 1
        );

        const task = tasks[taskIndex];
        if (!task) return;

        // Optimistic already applied, persist to Supabase
        let ok1 = true;
        await persistTaskMove(supabase, activeId, column.id, task.position).catch(
          () => {
            ok1 = false;
            // Rollback on error
            if (snapshotRef.current) {
              store.setColumns(snapshotRef.current);
            }
          }
        );
        if (ok1 && stageChanged) runAutomations({ type: "stage_entered" }, activeId);
        return;
      }

      const task = tasks[taskIndex];
      if (!task) return;

      // Persist to Supabase
      let ok2 = true;
      await persistTaskMove(supabase, activeId, column.id, task.position).catch(
        () => {
          ok2 = false;
          if (snapshotRef.current) {
            store.setColumns(snapshotRef.current);
          }
        }
      );
      if (ok2 && stageChanged) runAutomations({ type: "stage_entered" }, activeId);
    },
    [store, supabase]
  );

  return { sensors, handleDragStart, handleDragOver, handleDragEnd };
}

async function persistTaskMove(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  taskId: string,
  columnId: string,
  position: number
) {
  const { error } = await supabase
    .from("tasks")
    .update({ column_id: columnId, position })
    .eq("id", taskId);

  if (error) throw error;
}
