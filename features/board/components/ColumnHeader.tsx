"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Minimize2, Users, Clock, Gauge, ArrowLeft, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatHours } from "@/lib/utils";
import type { ColumnWithTasks } from "@/types";

interface Props {
  column: ColumnWithTasks;
  onAddTask: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMinimize?: () => void;
  onSetWipLimit?: (limit: number | null) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export function ColumnHeader({
  column, onAddTask, onRename, onDelete, onMinimize, onSetWipLimit, onMoveLeft, onMoveRight,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  function handleRename() {
    if (name.trim() && name.trim() !== column.name) onRename(name.trim());
    setEditing(false);
  }

  const totalTracked = column.tasks.reduce((sum, t) => sum + (t.tracked_hours ?? 0), 0);
  const totalEstimated = column.tasks.reduce((sum, t) => sum + ((t as any).estimated_hours ?? 0), 0);
  const hasHours = totalTracked > 0 || totalEstimated > 0;

  // Distinct users with tasks in this column
  const userIds = new Set<string>();
  column.tasks.forEach((t) => {
    if (t.assignee_id) userIds.add(t.assignee_id);
    (t as any).assignees?.forEach((a: any) => { const id = a?.user_id ?? a?.profile?.id; if (id) userIds.add(id); });
  });
  const userCount = userIds.size;

  // Average days until due (for tasks with due_date)
  const now = Date.now();
  const dueDays = column.tasks
    .filter((t) => t.due_date)
    .map((t) => Math.round((new Date(t.due_date!).getTime() - now) / 86400000));
  const avgDays = dueDays.length ? Math.round(dueDays.reduce((a, b) => a + b, 0) / dueDays.length) : null;

  const wipLimit = (column as any).wip_limit as number | null | undefined;
  const overLimit = wipLimit != null && column.tasks.length > wipLimit;

  function handleSetWip() {
    const cur = wipLimit != null ? String(wipLimit) : "";
    const input = prompt("Limite de tarefas (WIP) para esta etapa. Deixe vazio para remover:", cur);
    if (input === null) return;
    const n = parseInt(input);
    onSetWipLimit?.(input.trim() === "" || isNaN(n) ? null : n);
  }

  return (
    <div className={cn("flex flex-col gap-0.5 mb-3 px-1 rounded-lg group/header", overLimit && "bg-destructive/5 ring-1 ring-destructive/30 py-1")}>
      <div className="flex items-center gap-2">
        {column.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: column.color }} />}

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") { setName(column.name); setEditing(false); }
            }}
            className="flex-1 text-sm font-semibold text-brand-navy bg-transparent outline-none border-b border-brand-teal"
          />
        ) : (
          <h3 className={cn("flex-1 text-sm font-semibold truncate cursor-default", overLimit ? "text-destructive" : "text-brand-navy")} onDoubleClick={() => setEditing(true)}>
            {column.name}
          </h3>
        )}

        {/* Count / WIP badge */}
        <span className={cn(
          "text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0",
          overLimit ? "bg-destructive/15 text-destructive" : "bg-neutral-100 text-neutral-400"
        )}>
          {column.tasks.length}{wipLimit != null ? `/${wipLimit}` : ""}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
          <button onClick={onAddTask} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-brand-navy transition-colors">
            <Plus size={14} />
          </button>
          {onMinimize && (
            <button onClick={onMinimize} title="Colapsar etapa" className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-brand-navy transition-colors">
              <Minimize2 size={13} />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-brand-navy transition-colors">
              <MoreHorizontal size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setEditing(true)}><Pencil size={13} className="mr-2" /> Renomear</DropdownMenuItem>
              <DropdownMenuItem onClick={handleSetWip}><Gauge size={13} className="mr-2" /> {wipLimit != null ? "Alterar WIP limit" : "Adicionar WIP limit"}</DropdownMenuItem>
              {onMinimize && <DropdownMenuItem onClick={onMinimize}><Minimize2 size={13} className="mr-2" /> Colapsar etapa</DropdownMenuItem>}
              <DropdownMenuSeparator />
              {onMoveLeft && <DropdownMenuItem onClick={onMoveLeft}><ArrowLeft size={13} className="mr-2" /> Mover para esquerda</DropdownMenuItem>}
              {onMoveRight && <DropdownMenuItem onClick={onMoveRight}><ArrowRight size={13} className="mr-2" /> Mover para direita</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 size={13} className="mr-2" /> Excluir coluna</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 pl-4 text-[10px] text-neutral-400 font-normal">
        {userCount > 0 && (
          <span className="flex items-center gap-0.5" title={`${userCount} responsável(is) nesta etapa`}>
            <Users size={10} /> {userCount}
          </span>
        )}
        {avgDays !== null && (
          <span className="flex items-center gap-0.5" title="Prazo médio das tarefas">
            <Clock size={10} /> {avgDays >= 0 ? `${avgDays}d` : `${Math.abs(avgDays)}d atrás`}
          </span>
        )}
        {hasHours && (
          <span>{formatHours(totalTracked)}{totalEstimated > 0 ? ` / ${formatHours(totalEstimated)}` : ""}</span>
        )}
      </div>
    </div>
  );
}
