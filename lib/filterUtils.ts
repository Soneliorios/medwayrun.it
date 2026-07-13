/**
 * filterUtils — pure helpers to apply BoardFilters to columns/tasks and to
 * derive the available filter options from the data currently on the board.
 *
 * Kept framework-free so it can be unit-tested and reused by every view
 * (Kanban, Lista, Calendário, Gantt, Dashboard).
 */

import type { BoardFilters } from "@/features/board/store/filterStore";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";

export interface FilterContext {
  /** Task id whose timer is currently running (for the "Em execução" filter). */
  activeTimerTaskId?: string | null;
  /** Current user id (for "minhas partes abertas"). */
  currentUserId?: string | null;
  /** Reference "now" — injectable for testing. Defaults to new Date(). */
  now?: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function taskAssigneeIds(task: TaskWithRelations): string[] {
  const ids = new Set<string>();
  if (task.assignee_id) ids.add(task.assignee_id);
  task.assignees?.forEach((a: any) => {
    const id = a?.user_id ?? a?.profile?.id ?? a?.id;
    if (id) ids.add(id);
  });
  // Inclui todos os responsáveis da fila/paralelo (não só a cabeça/assignee),
  // para o filtro "Alocados" casar com qualquer responsável da task.
  (task as any).sequence?.forEach((s: any) => { if (s?.user_id) ids.add(s.user_id); });
  return [...ids];
}

function taskTagIds(task: TaskWithRelations): string[] {
  return (task.labels ?? []).map((l: any) => l.id).filter(Boolean);
}

function taskFollowerIds(task: TaskWithRelations): string[] {
  return ((task as any).followers ?? []).map((f: any) => f?.user_id ?? f?.id).filter(Boolean);
}

function isOverdue(task: TaskWithRelations, now: Date): boolean {
  if (!task.due_date) return false;
  if (task.status === "delivered" || task.status === "archived") return false;
  return new Date(task.due_date.slice(0, 10) + "T23:59:59") < now;
}

// ─── Single-task matcher ────────────────────────────────────────────────────

export function taskMatchesFilters(
  task: TaskWithRelations,
  filters: BoardFilters,
  ctx: FilterContext = {}
): boolean {
  const now = ctx.now ?? new Date();

  // Text title
  if (filters.title) {
    if (!task.title?.toLowerCase().includes(filters.title.toLowerCase())) return false;
  }

  // Task id / number search (matches id substring or short id)
  if (filters.taskId) {
    const q = filters.taskId.toLowerCase().replace(/^#/, "");
    const short = (task as any).short_id ? String((task as any).short_id) : "";
    if (!task.id.toLowerCase().includes(q) && !short.includes(q)) return false;
  }

  // Stages (column_id)
  if (filters.stages?.length) {
    if (!filters.stages.includes(task.column_id)) return false;
  }

  // Types (type_id)
  if (filters.types?.length) {
    if (!task.type_id || !filters.types.includes(task.type_id)) return false;
  }

  // Tags (any-match)
  if (filters.tags?.length) {
    const ids = taskTagIds(task);
    if (!filters.tags.some((t) => ids.includes(t))) return false;
  }

  // Assignees (any-match)
  if (filters.assignees?.length) {
    const ids = taskAssigneeIds(task);
    if (!filters.assignees.some((a) => ids.includes(a))) return false;
  }

  // Created by
  if (filters.createdBy?.length) {
    if (!task.created_by || !filters.createdBy.includes(task.created_by)) return false;
  }

  // Followers
  if (filters.followers?.length) {
    const ids = taskFollowerIds(task);
    if (!filters.followers.some((f) => ids.includes(f))) return false;
  }

  // Requesting / requested areas
  if (filters.areaRequesting?.length) {
    if (!task.requesting_area_id || !filters.areaRequesting.includes(task.requesting_area_id)) return false;
  }
  if (filters.areaRequested?.length) {
    if (!task.requested_area_id || !filters.areaRequested.includes(task.requested_area_id)) return false;
  }

  // Projects / clients (relevant in cross-board contexts)
  if (filters.projects?.length) {
    if (!filters.projects.includes(task.project_id)) return false;
  }
  if (filters.clients?.length) {
    const clientId = (task as any).client_id;
    if (!clientId || !filters.clients.includes(clientId)) return false;
  }
  if (filters.teams?.length) {
    const teamId = (task as any).team_id;
    if (!teamId || !filters.teams.includes(teamId)) return false;
  }

  // Priorities (checkbox group)
  if (filters.priorities?.length) {
    if (!filters.priorities.includes(task.priority ?? "medium")) return false;
  }

  // Situação / status
  if (filters.statuses?.length) {
    if (!filters.statuses.includes(task.status ?? "open")) return false;
  }

  // Due date range
  if (filters.dueFrom) {
    if (!task.due_date || task.due_date.slice(0, 10) < filters.dueFrom) return false;
  }
  if (filters.dueTo) {
    if (!task.due_date || task.due_date.slice(0, 10) > filters.dueTo) return false;
  }

  // Boolean toggles
  if (filters.isUrgent && !task.is_urgent) return false;
  if (filters.isOverdue && !isOverdue(task, now)) return false;
  if (filters.isRunning && ctx.activeTimerTaskId !== task.id) return false;
  if (filters.hasOpenParts) {
    const mine = task.assignees?.find((a: any) => (a?.user_id ?? a?.profile?.id) === ctx.currentUserId);
    if (!mine || (mine as any).delivered_at) return false;
  }

  // Board projects (internal)
  if (filters.boardProjectIds?.length) {
    const bp = (task as any).board_subproject_id as string | null | undefined;
    if (!bp || !filters.boardProjectIds.includes(bp)) return false;
  }

  // Subtasks visibility
  const isSubtask = !!task.parent_task_id;
  if (filters.subtasks === "hide" && isSubtask) return false;
  if (filters.subtasks === "only" && !isSubtask) return false;

  return true;
}

// ─── Column-level application ──────────────────────────────────────────────────

/** Returns a new array of columns, each with its task list filtered. */
export function applyBoardFilters(
  columns: ColumnWithTasks[],
  filters: BoardFilters,
  ctx: FilterContext = {}
): ColumnWithTasks[] {
  if (!hasActiveFilters(filters)) return columns;
  return columns.map((col) => ({
    ...col,
    tasks: col.tasks.filter((t) => taskMatchesFilters(t, filters, ctx)),
  }));
}

export function hasActiveFilters(filters: BoardFilters): boolean {
  return Object.keys(filters).some((k) => {
    const v = filters[k as keyof BoardFilters];
    if (v === undefined || v === "" || v === false) return false;
    if (v === "all" && k === "subtasks") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

// ─── Option extraction ────────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
  color?: string;
}

export interface BoardFilterOptions {
  stages: FilterOption[];
  types: FilterOption[];
  tags: FilterOption[];
  assignees: FilterOption[];
  creators: FilterOption[];
  areas: FilterOption[];
  priorities: FilterOption[];
  statuses: FilterOption[];
}

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "low", label: "Baixa", color: "#A0A4A8" },
  { value: "medium", label: "Média", color: "#407EC9" },
  { value: "high", label: "Alta", color: "#FFB81C" },
  { value: "urgent", label: "Urgente", color: "#AC145A" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: "open", label: "Aberta" },
  { value: "in_progress", label: "Em andamento" },
  { value: "delivered", label: "Entregue" },
  { value: "archived", label: "Arquivada" },
];

export function extractFilterOptions(columns: ColumnWithTasks[]): BoardFilterOptions {
  const stages: FilterOption[] = columns.map((c) => ({
    value: c.id,
    label: c.name,
    color: c.color ?? "#A0A4A8",
  }));

  const typeMap = new Map<string, FilterOption>();
  const tagMap = new Map<string, FilterOption>();
  const assigneeMap = new Map<string, FilterOption>();
  const creatorMap = new Map<string, FilterOption>();
  const areaMap = new Map<string, FilterOption>();

  for (const col of columns) {
    for (const t of col.tasks) {
      if (t.type_id && t.task_type) {
        typeMap.set(t.type_id, { value: t.type_id, label: t.task_type.name, color: (t.task_type as any).color });
      }
      (t.labels ?? []).forEach((l: any) => {
        if (l?.id) tagMap.set(l.id, { value: l.id, label: l.name, color: l.color });
      });
      // assignees
      if (t.assignee_id) {
        assigneeMap.set(t.assignee_id, {
          value: t.assignee_id,
          label: t.assignee?.full_name ?? "Sem nome",
        });
      }
      t.assignees?.forEach((a: any) => {
        const id = a?.user_id ?? a?.profile?.id;
        if (id) assigneeMap.set(id, { value: id, label: a?.profile?.full_name ?? "Sem nome" });
      });
      if (t.created_by) {
        creatorMap.set(t.created_by, { value: t.created_by, label: (t as any).creator?.full_name ?? t.created_by });
      }
      if (t.requesting_area_id && t.requesting_area) {
        areaMap.set(t.requesting_area_id, { value: t.requesting_area_id, label: t.requesting_area.name });
      }
      if (t.requested_area_id && t.requested_area) {
        areaMap.set(t.requested_area_id, { value: t.requested_area_id, label: t.requested_area.name });
      }
    }
  }

  return {
    stages,
    types: [...typeMap.values()],
    tags: [...tagMap.values()],
    assignees: [...assigneeMap.values()],
    creators: [...creatorMap.values()],
    areas: [...areaMap.values()],
    priorities: PRIORITY_OPTIONS,
    statuses: STATUS_OPTIONS,
  };
}

// ─── URL (de)serialization for shareable filters ──────────────────────────────

export function encodeFilters(filters: BoardFilters): string {
  try {
    const json = JSON.stringify(filters);
    if (typeof window === "undefined") return "";
    return btoa(encodeURIComponent(json));
  } catch {
    return "";
  }
}

export function decodeFilters(encoded: string): BoardFilters | null {
  try {
    if (typeof window === "undefined") return null;
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json) as BoardFilters;
  } catch {
    return null;
  }
}
