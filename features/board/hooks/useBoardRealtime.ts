"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBoardStore } from "../store/boardStore";
import { taskService } from "@/features/tasks/services/taskService";
import type { TaskWithRelations, ColumnWithTasks } from "@/types";

export function useBoardRealtime(projectId: string) {
  const store = useBoardStore();
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`board:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          // Skip if this update was triggered locally (optimistic already applied)
          if (eventType === "INSERT") {
            // Only add if not already present (avoids double from optimistic)
            const exists = store.columns
              .flatMap((c) => c.tasks)
              .some((t) => t.id === (newRow as any).id);
            if (!exists) {
              store.addTask(
                (newRow as any).column_id,
                newRow as unknown as TaskWithRelations
              );
            }
          } else if (eventType === "UPDATE") {
            // Soft delete chega como UPDATE (deleted_at setado) — trata como remoção
            // para o card sumir do board em outros clientes (e neste).
            if ((newRow as any).deleted_at) {
              store.removeTask((newRow as any).id);
              return;
            }
            const localTask = store.columns
              .flatMap((c) => c.tasks)
              .find((t) => t.id === (newRow as any).id);

            // Restaurado (ou update de task ausente do store): não está no board.
            // updateTask seria no-op — busca a linha hidratada (joins) e re-insere.
            if (!localTask) {
              const rid = (newRow as any).id;
              taskService.get(rid)
                .then((t) => { if (t) store.addTask((t as any).column_id, t as unknown as TaskWithRelations); })
                .catch(() => { /* task pode ter sumido — ignora */ });
              return;
            }

            // Only apply server update if it's "newer" (avoid overwriting optimistic)
            if (
              !localTask ||
              new Date((newRow as any).updated_at) >=
                new Date(localTask.updated_at)
            ) {
              store.updateTask(
                (newRow as any).id,
                newRow as unknown as Partial<TaskWithRelations>
              );

              // Handle column change from another client
              if (
                localTask &&
                localTask.column_id !== (newRow as any).column_id
              ) {
                store.moveTask(
                  (newRow as any).id,
                  (newRow as any).column_id,
                  (newRow as any).position
                );
              }
            }
          } else if (eventType === "DELETE") {
            store.removeTask((oldRow as any).id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "columns",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === "INSERT") {
            // Only add if not already present (avoids double from optimistic)
            const exists = store.columns.some(
              (c) => c.id === (newRow as any).id
            );
            if (!exists) {
              store.addColumn({
                ...(newRow as unknown as ColumnWithTasks),
                tasks: [],
              });
            }
          } else if (eventType === "UPDATE") {
            // Sync every field the board renders — notably `position`, so
            // column reordering from any client reflects in real time.
            store.updateColumn((newRow as any).id, {
              name: (newRow as any).name,
              color: (newRow as any).color,
              position: (newRow as any).position,
              is_done_column: (newRow as any).is_done_column,
            });
          } else if (eventType === "DELETE") {
            store.removeColumn((oldRow as any).id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
}
