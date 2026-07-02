"use client";

import { useCallback, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import { ColumnHeader } from "./ColumnHeader";
import type { ColumnWithTasks } from "@/types";
import { useBoardStore } from "../store/boardStore";
import { createRawClient } from "@/lib/supabase/client";

interface Props {
  column: ColumnWithTasks;
  onTaskOpen: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
}

export function KanbanColumn({ column, onTaskOpen, onAddTask }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });

  const store = useBoardStore();
  const [minimized, setMinimized] = useState(
    (column as any).is_minimized ?? false
  );

  async function toggleMinimize() {
    const next = !minimized;
    setMinimized(next);
    const supabase = createRawClient();
    await supabase.from("columns").update({ is_minimized: next }).eq("id", column.id);
  }

  // Minimized state — narrow vertical strip
  if (minimized) {
    return (
      <div className="kanban-column w-10 shrink-0 flex flex-col items-center gap-2 py-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
        <button
          onClick={toggleMinimize}
          className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
        <div
          className="flex-1 flex items-center justify-center"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          <span className="text-xs font-medium text-neutral-500 truncate max-h-32">
            {column.name}
          </span>
          <span className="text-[10px] text-neutral-400 mt-1">
            ({column.tasks.length})
          </span>
        </div>
      </div>
    );
  }

  const handleRename = useCallback(
    async (newName: string) => {
      store.updateColumn(column.id, { name: newName }); // optimistic
      const supabase = createRawClient();
      const { error } = await supabase
        .from("columns")
        .update({ name: newName })
        .eq("id", column.id);
      if (error) store.updateColumn(column.id, { name: column.name }); // revert
    },
    [column.id, column.name, store]
  );

  const handleDelete = useCallback(async () => {
    if (column.tasks.length > 0) {
      if (!confirm(`A coluna "${column.name}" tem tarefas. Excluir mesmo assim?`)) return;
    }
    store.removeColumn(column.id); // optimistic
    const supabase = createRawClient();
    await supabase.from("columns").delete().eq("id", column.id);
  }, [column, store]);

  async function handleSetWipLimit(limit: number | null) {
    store.updateColumn(column.id, { wip_limit: limit } as any); // optimistic
    const supabase = createRawClient();
    await supabase.from("columns").update({ wip_limit: limit }).eq("id", column.id);
  }

  async function handleSetColor(color: string | null) {
    store.updateColumn(column.id, { color } as any);
    const supabase = createRawClient();
    const { error } = await supabase.from("columns").update({ color }).eq("id", column.id);
    if (error) store.updateColumn(column.id, { color: column.color } as any);
  }

  async function handleSetFinal(isFinal: boolean) {
    const supabase = createRawClient();
    if (isFinal) {
      const boardId = (column as any).project_id;
      await supabase.from("columns").update({ is_done_column: false }).eq("project_id", boardId);
      store.columns.forEach((c) => store.updateColumn(c.id, { is_done_column: false } as any));
    }
    store.updateColumn(column.id, { is_done_column: isFinal } as any);
    await supabase.from("columns").update({ is_done_column: isFinal }).eq("id", column.id);
  }

  async function moveColumn(dir: -1 | 1) {
    const cols = [...store.columns].sort((a, b) => a.position - b.position);
    const idx = cols.findIndex((c) => c.id === column.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cols.length) return;
    const a = cols[idx], b = cols[j];
    // swap positions
    store.updateColumn(a.id, { position: b.position } as any);
    store.updateColumn(b.id, { position: a.position } as any);
    const supabase = createRawClient();
    await Promise.all([
      supabase.from("columns").update({ position: b.position }).eq("id", a.id),
      supabase.from("columns").update({ position: a.position }).eq("id", b.id),
    ]);
  }

  const sortedCols = [...store.columns].sort((a, b) => a.position - b.position);
  const colIdx = sortedCols.findIndex((c) => c.id === column.id);

  const taskIds = column.tasks.map((t) => t.id);

  return (
    <div
      className={cn(
        "kanban-column flex flex-col w-64 shrink-0",
        "bg-neutral-50/80 rounded-xl p-3",
        "border border-transparent transition-colors",
        isOver && "border-brand-teal/30 bg-brand-teal/5"
      )}
    >
      <ColumnHeader
        column={column}
        onAddTask={() => onAddTask(column.id)}
        onRename={handleRename}
        onDelete={handleDelete}
        onSetColor={handleSetColor}
        onSetFinal={handleSetFinal}
        onMinimize={toggleMinimize}
        onSetWipLimit={handleSetWipLimit}
        onMoveLeft={colIdx > 0 ? () => moveColumn(-1) : undefined}
        onMoveRight={colIdx < sortedCols.length - 1 ? () => moveColumn(1) : undefined}
      />

      {/* Droppable task list */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 flex flex-col gap-2 min-h-[80px]",
          "transition-colors rounded-lg",
          isOver && column.tasks.length === 0 && "bg-brand-teal/5"
        )}
      >
        <SortableContext
          items={taskIds}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onTaskOpen} />
          ))}
        </SortableContext>

        {/* Empty drop zone indicator */}
        {column.tasks.length === 0 && (
          <div
            className={cn(
              "flex-1 rounded-lg border-2 border-dashed border-neutral-200 min-h-[60px]",
              "flex items-center justify-center transition-colors",
              isOver && "border-brand-teal/40"
            )}
          >
            <span className="text-xs text-neutral-300">Soltar aqui</span>
          </div>
        )}
      </div>

      {/* Add task button */}
      <button
        onClick={() => onAddTask(column.id)}
        className="mt-2 w-full text-xs text-neutral-400 hover:text-brand-navy py-1.5 rounded-lg hover:bg-neutral-100 transition-colors text-left px-2"
      >
        + Adicionar tarefa
      </button>
    </div>
  );
}
