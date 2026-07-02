"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Minimize2, Users, Clock, Gauge, ArrowLeft, ArrowRight, Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatHours } from "@/lib/utils";
import type { ColumnWithTasks } from "@/types";

const COLOR_PALETTE = [
  null,       // sem cor (remover)
  "#94a3b8",  // cinza
  "#60a5fa",  // azul
  "#01CFB5",  // teal (brand)
  "#34d399",  // verde
  "#fbbf24",  // amarelo
  "#fb923c",  // laranja
  "#f87171",  // vermelho
  "#c084fc",  // roxo
  "#818cf8",  // indigo
];

interface Props {
  column: ColumnWithTasks;
  onAddTask: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onSetColor?: (color: string | null) => void;
  onSetFinal?: (isFinal: boolean) => void;
  onMinimize?: () => void;
  onSetWipLimit?: (limit: number | null) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export function ColumnHeader({
  column, onAddTask, onRename, onDelete, onSetColor, onSetFinal,
  onMinimize, onSetWipLimit, onMoveLeft, onMoveRight,
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

  const userIds = new Set<string>();
  column.tasks.forEach((t) => {
    if (t.assignee_id) userIds.add(t.assignee_id);
    (t as any).assignees?.forEach((a: any) => { const id = a?.user_id ?? a?.profile?.id; if (id) userIds.add(id); });
  });
  const userCount = userIds.size;

  const now = Date.now();
  const dueDays = column.tasks
    .filter((t) => t.due_date)
    .map((t) => Math.round((new Date(t.due_date!).getTime() - now) / 86400000));
  const avgDays = dueDays.length ? Math.round(dueDays.reduce((a, b) => a + b, 0) / dueDays.length) : null;

  const wipLimit = (column as any).wip_limit as number | null | undefined;
  const overLimit = wipLimit != null && column.tasks.length > wipLimit;
  const isFinal = !!(column as any).is_done_column;

  function handleSetWip() {
    const cur = wipLimit != null ? String(wipLimit) : "";
    const input = prompt("Limite de tarefas (WIP) para esta etapa. Deixe vazio para remover:", cur);
    if (input === null) return;
    const n = parseInt(input);
    onSetWipLimit?.(input.trim() === "" || isNaN(n) ? null : n);
  }

  return (
    <div className={cn("flex flex-col gap-0.5 mb-3 px-1 rounded-lg group/header", overLimit && "bg-destructive/5 ring-1 ring-destructive/30 py-1")}>
      <div className="flex items-start gap-2">
        {/* Color dot — vertically centered with first line */}
        <span className="mt-1 shrink-0">
          {column.color
            ? <span className="w-2 h-2 rounded-full block" style={{ background: column.color }} />
            : <span className="w-2 h-2 block" />}
        </span>

        {editing ? (
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") { setName(column.name); setEditing(false); }
              }}
              className="w-full text-sm font-semibold text-brand-navy bg-transparent outline-none border-b border-brand-teal"
            />
            {/* Color picker */}
            {onSetColor && (
              <div className="flex items-center gap-1 flex-wrap">
                {COLOR_PALETTE.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onSetColor(c); }}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-transform hover:scale-110",
                      column.color === c ? "border-brand-navy scale-110" : "border-transparent",
                      !c && "bg-neutral-200 border-dashed border-neutral-400"
                    )}
                    style={c ? { background: c } : undefined}
                    title={c ?? "Sem cor"}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <h3
            className={cn(
              "flex-1 text-sm font-semibold leading-tight break-words min-w-0 cursor-default line-clamp-2",
              overLimit ? "text-destructive" : "text-brand-navy"
            )}
            onDoubleClick={() => setEditing(true)}
          >
            {column.name}
            {isFinal && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-semibold text-brand-teal bg-brand-teal/10 px-1 py-0.5 rounded align-middle">
                <Flag size={8} /> ENTREGA
              </span>
            )}
          </h3>
        )}

        {/* Count / WIP badge */}
        <span className={cn(
          "text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5",
          overLimit ? "bg-destructive/15 text-destructive" : "bg-neutral-100 text-neutral-400"
        )}>
          {column.tasks.length}{wipLimit != null ? `/${wipLimit}` : ""}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity shrink-0">
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
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil size={13} className="mr-2" /> Renomear / cor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSetWip}>
                <Gauge size={13} className="mr-2" /> {wipLimit != null ? "Alterar WIP limit" : "Adicionar WIP limit"}
              </DropdownMenuItem>
              {onMinimize && (
                <DropdownMenuItem onClick={onMinimize}>
                  <Minimize2 size={13} className="mr-2" /> Colapsar etapa
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onSetFinal && (
                <DropdownMenuItem onClick={() => onSetFinal(!isFinal)}>
                  <Flag size={13} className={cn("mr-2", isFinal ? "text-brand-teal" : "")} />
                  {isFinal ? "Remover como etapa final" : "Marcar como etapa final"}
                </DropdownMenuItem>
              )}
              {onMoveLeft && (
                <DropdownMenuItem onClick={onMoveLeft}>
                  <ArrowLeft size={13} className="mr-2" /> Mover para esquerda
                </DropdownMenuItem>
              )}
              {onMoveRight && (
                <DropdownMenuItem onClick={onMoveRight}>
                  <ArrowRight size={13} className="mr-2" /> Mover para direita
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 size={13} className="mr-2" /> Excluir coluna
              </DropdownMenuItem>
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
