"use client";

import { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Calendar,
  MessageSquare,
  Play,
  Square,
  Flag,
  Paperclip,
  ListChecks,
} from "lucide-react";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { PRIORITY_COLORS, PRIORITY_LABELS, formatElapsed as fmtElapsed } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSelectionStore } from "../store/selectionStore";
import type { TaskWithRelations } from "@/types";

interface Props {
  task: TaskWithRelations;
  onOpen?: (taskId: string) => void;
}

function TaskCardInner({ task, onOpen }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  const { user } = useAuthStore();
  const timerStore = useTimerStore();
  const { toggleTask, isSelected } = useSelectionStore();
  const isActive = timerStore.activeTaskId === task.id;
  const elapsed = timerStore.getElapsedForTask(task.id);
  const selected = isSelected(task.id);

  const handleClick = useCallback(() => {
    if (!isDragging) onOpen?.(task.id);
  }, [isDragging, onOpen, task.id]);

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!user?.id) return;
      if (isActive) {
        timerStore.stopTimer(user.id);
      } else {
        timerStore.startTimer(user.id, task.id);
      }
    },
    [isActive, task.id, timerStore, user?.id]
  );

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTask(task.id);
    },
    [task.id, toggleTask]
  );

  const overdue = isOverdue(task.due_date);

  // SLA progress
  const slaMinutes = (task as any).sla_minutes as number | null;
  const trackedMinutes = Math.round((task.tracked_hours ?? 0) * 60);
  const slaPct = slaMinutes && slaMinutes > 0 ? (trackedMinutes / slaMinutes) * 100 : null;
  const slaColor = slaPct !== null
    ? slaPct < 70 ? "#01CFB5" : slaPct < 100 ? "#FFB81C" : "#AC145A"
    : null;

  // Tracked/estimated progress (fallback when no SLA)
  const estHours = (task as any).estimated_hours as number | null;
  const trackedHours = task.tracked_hours ?? 0;
  const progressPct = slaPct === null && estHours && estHours > 0
    ? Math.min((trackedHours / estHours) * 100, 100)
    : null;
  const progressColor = progressPct !== null
    ? progressPct < 70 ? "#01CFB5" : progressPct < 100 ? "#FFB81C" : "#AC145A"
    : null;

  // Counters
  const checklist = task.checklist_items ?? [];
  const checklistDone = checklist.filter((i) => i.is_done).length;
  const attachmentCount = (() => {
    if (typeof window === "undefined") return 0;
    try { return JSON.parse(localStorage.getItem(`mwr_attachments_${task.id}`) ?? "[]").length; } catch { return 0; }
  })();
  const shortId = task.id.slice(0, 4).toUpperCase();

  // Assignees
  const assignees = (task as any).assignees as any[] | null;
  const orgMembers = useOrgMembers();
  // Always reflect the current assignee_id. Use the joined object only when it
  // matches assignee_id (else it's stale, e.g. after the queue changed it);
  // otherwise resolve the name from org members.
  const primaryAssignee = (task.assignee && (task.assignee as any).id === task.assignee_id)
    ? task.assignee
    : (task.assignee_id
      ? (() => { const m = orgMembers.find((x) => x.id === task.assignee_id); return m ? { id: m.id, full_name: m.full_name, avatar_url: m.avatar_url } : null; })()
      : null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white rounded-lg border cursor-pointer select-none",
        "task-card-hover transition-all",
        selected
          ? "border-brand-teal shadow-md"
          : overdue
          ? "border-red-200 border-l-4 border-l-destructive bg-red-50/30"
          : "border-neutral-100",
        isDragging && "opacity-50 shadow-lg scale-[1.02] z-50 dragging-item"
      )}
      onClick={handleClick}
    >
      {/* Priority bar */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full"
        style={{ background: PRIORITY_COLORS[task.priority] ?? "#A0A4A8" }}
      />

      <div className="px-3.5 pt-3 pb-2.5 pl-4">
        {/* Top row: checkbox (on hover/selected) + labels + flag */}
        <div className="flex items-start gap-1.5 mb-2">
          {/* Checkbox */}
          <div
            className={cn(
              "shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-all cursor-pointer mt-0.5",
              selected
                ? "bg-brand-teal border-brand-teal"
                : "border-neutral-300 opacity-0 group-hover:opacity-100"
            )}
            onClick={handleCheckbox}
          >
            {selected && (
              <svg viewBox="0 0 10 8" className="w-2 h-2 text-white" fill="currentColor">
                <path d="M1 4l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </div>

          {/* ID + type */}
          <div className="flex flex-wrap gap-1.5 flex-1 items-center">
            <span className="text-[10px] font-mono text-neutral-300">#{shortId}</span>
            {typeof (task as any).task_type === "string" && (task as any).task_type && (task as any).task_type !== "Padrão" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 bg-brand-navy/5 text-brand-navy">
                {(task as any).task_type}
              </span>
            )}
          </div>

          {/* Urgent flag + priority dot */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {(task as any).is_urgent && (
              <Flag size={11} className="text-destructive" fill="currentColor" />
            )}
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: PRIORITY_COLORS[task.priority] ?? "#A0A4A8" }}
              title={`Prioridade: ${PRIORITY_LABELS[task.priority] ?? task.priority}`}
            />
          </div>
        </div>

        {/* Title */}
        <p className="text-sm text-brand-navy leading-snug pr-4 mb-2.5 line-clamp-2">
          {task.title}
        </p>

        {/* Tags row */}
        {(task.labels?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {task.labels!.slice(0, 2).map((label) => (
              <span
                key={label.id}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: `${label.color}20`, color: label.color }}
              >
                {label.name}
              </span>
            ))}
            {task.labels!.length > 2 && (
              <span className="text-[10px] text-neutral-400">+{task.labels!.length - 2}</span>
            )}
          </div>
        )}

        {/* Subtask progress */}
        {(task.subtasks?.length ?? 0) > 0 && (() => {
          const subs = task.subtasks!;
          const subDone = subs.filter((s: any) => s.status === "delivered").length;
          return (
            <div className="mb-2.5">
              <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                <span>{subDone}/{subs.length} subtarefas</span>
              </div>
              <div className="h-1 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-teal" style={{ width: `${(subDone / subs.length) * 100}%` }} />
              </div>
            </div>
          );
        })()}

        {/* SLA / progress bar */}
        {slaPct !== null ? (
          <div className="h-0.5 rounded-full bg-neutral-100 mb-2.5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(slaPct, 100)}%`, background: slaColor! }} />
          </div>
        ) : progressPct !== null ? (
          <div className="h-0.5 rounded-full bg-neutral-100 mb-2.5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: progressColor! }} />
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center gap-1.5">
          {/* Play button */}
          <button
            onClick={handlePlay}
            className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center transition-all shrink-0",
              isActive
                ? "bg-brand-teal text-white"
                : "text-neutral-300 hover:text-brand-teal hover:bg-brand-teal/10 opacity-0 group-hover:opacity-100"
            )}
          >
            {isActive ? <Square size={8} /> : <Play size={8} />}
          </button>

          {/* Timer display */}
          {isActive && (
            <span className="text-[10px] font-mono text-brand-teal font-semibold">
              {fmtElapsed(elapsed)}
            </span>
          )}

          {/* Due date */}
          {task.due_date && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[11px] font-medium",
                overdue ? "text-destructive" : "text-neutral-400"
              )}
            >
              <Calendar size={9} />
              {formatDate(task.due_date)}
            </span>
          )}

          <span className="flex-1" />

          {/* Counters: attachments, comments, checklist */}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
              <Paperclip size={9} />{attachmentCount}
            </span>
          )}
          {(task._commentCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
              <MessageSquare size={9} />{task._commentCount}
            </span>
          )}
          {checklist.length > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
              <ListChecks size={9} />{checklistDone}/{checklist.length}
            </span>
          )}

          {/* Assignees */}
          {assignees && assignees.length > 0 ? (
            <div className="flex -space-x-1">
              {assignees.slice(0, 3).map((a: any) => (
                <Avatar
                  key={a.user_id}
                  className={cn("w-5 h-5 border-2", a.delivered_at ? "border-brand-teal" : "border-white")}
                  title={a.profile?.full_name ?? a.user_id}
                >
                  <AvatarImage src={a.profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px] font-bold text-white" style={{ background: stringToColor(a.profile?.full_name ?? a.user_id ?? "?") }}>
                    {getInitials(a.profile?.full_name) || (a.user_id ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {assignees.length > 3 && (
                <span className="w-5 h-5 rounded-full border-2 border-white bg-neutral-200 flex items-center justify-center text-[8px] text-neutral-600 font-bold">
                  +{assignees.length - 3}
                </span>
              )}
            </div>
          ) : primaryAssignee ? (
            <Avatar className="w-5 h-5" title={primaryAssignee.full_name ?? undefined}>
              <AvatarImage src={primaryAssignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px] font-bold text-white" style={{ background: stringToColor(primaryAssignee.full_name ?? "?") }}>
                {getInitials(primaryAssignee.full_name)}
              </AvatarFallback>
            </Avatar>
          ) : task.assignee_id ? (
            <Avatar className="w-5 h-5" title={task.assignee_id}>
              <AvatarFallback className="text-[9px] font-bold text-white" style={{ background: stringToColor(task.assignee_id) }}>
                {task.assignee_id.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      </div>

      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded",
          "opacity-0 group-hover:opacity-100",
          "text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100",
          "transition-all cursor-grab active:cursor-grabbing touch-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} />
      </button>
    </div>
  );
}

export const TaskCard = memo(TaskCardInner, (prev, next) => {
  return (
    prev.task.id === next.task.id &&
    prev.task.title === next.task.title &&
    prev.task.priority === next.task.priority &&
    prev.task.due_date === next.task.due_date &&
    prev.task.column_id === next.task.column_id &&
    prev.task.assignee_id === next.task.assignee_id &&
    prev.task._commentCount === next.task._commentCount &&
    prev.task.labels?.length === next.task.labels?.length &&
    (prev.task as any).is_urgent === (next.task as any).is_urgent &&
    (prev.task as any).sla_minutes === (next.task as any).sla_minutes
  );
});

TaskCard.displayName = "TaskCard";

// Consistent avatar color per name/id
const AVATAR_COLORS = ["#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#F97316", "#06B6D4", "#84CC16"];
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
