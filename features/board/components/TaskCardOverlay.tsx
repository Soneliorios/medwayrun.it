"use client";

import { Calendar } from "lucide-react";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { PRIORITY_COLORS } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { TaskWithRelations } from "@/types";

/** Card rendered inside DragOverlay — no drag handles, slightly scaled, elevated shadow */
export function TaskCardOverlay({ task }: { task: TaskWithRelations }) {
  const overdue = isOverdue(task.due_date);

  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-neutral-200 p-3.5",
        "shadow-2xl ring-1 ring-brand-teal/20",
        "rotate-1 scale-[1.03] cursor-grabbing select-none",
        "dragging-item"
      )}
      style={{ width: 260 }}
    >
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
        style={{ background: PRIORITY_COLORS[task.priority] ?? "#A0A4A8" }}
      />

      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 2).map((label) => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: `${label.color}20`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-brand-navy leading-snug mb-2.5">{task.title}</p>

      <div className="flex items-center gap-2">
        {task.due_date && (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium",
              overdue ? "text-destructive" : "text-neutral-400"
            )}
          >
            <Calendar size={10} />
            {formatDate(task.due_date)}
          </span>
        )}
        <span className="flex-1" />
        {task.assignee && (
          <Avatar className="w-5 h-5">
            <AvatarImage src={task.assignee.avatar_url ?? undefined} />
            <AvatarFallback className="text-[9px] font-semibold bg-brand-navy/10 text-brand-navy">
              {getInitials(task.assignee.full_name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
