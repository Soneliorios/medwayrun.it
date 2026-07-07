// ─── Week helpers ─────────────────────────────────────────────────────────────

export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getWeekDays(monday: string): string[] {
  const result: string[] = [];
  const base = new Date(monday + "T12:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

// ─── Board task types (stored in localStorage per board) ─────────────────────

export interface BoardTaskType {
  id: string;
  name: string;
  color: string;
  default_hours: number;
}

// Standard types seeded for a board that has never been configured. Mirrors
// the defaults used by the board settings page so all screens agree.
export const DEFAULT_BOARD_TYPES: BoardTaskType[] = [
  { id: "type-padrao", name: "Padrão", color: "#407EC9", default_hours: 2 },
  { id: "type-bug", name: "Bug", color: "#AC145A", default_hours: 1 },
  { id: "type-feature", name: "Feature", color: "#3B3FB6", default_hours: 4 },
  { id: "type-reuniao", name: "Reunião", color: "#01CFB5", default_hours: 1 },
];

function boardTypesKey(boardId: string): string {
  return `mwr_task_types_${boardId}`;
}

export function loadBoardTypes(boardId: string): BoardTaskType[] {
  try {
    const raw = localStorage.getItem(boardTypesKey(boardId));
    if (!raw) return [];
    return JSON.parse(raw) as BoardTaskType[];
  } catch {
    return [];
  }
}

export function saveBoardTypes(boardId: string, types: BoardTaskType[]): void {
  try {
    localStorage.setItem(boardTypesKey(boardId), JSON.stringify(types));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

/**
 * Add a new task type to a board and persist it. Seeds the standard defaults
 * first if the board has none yet, so creating a custom type never wipes the
 * built-ins. Returns the full updated list. If the name already exists
 * (case-insensitive) the existing list is returned unchanged.
 */
export function addBoardType(
  boardId: string,
  name: string,
  opts?: { color?: string; default_hours?: number }
): BoardTaskType[] {
  const trimmed = name.trim();
  if (!trimmed) return loadBoardTypes(boardId);

  const existing = loadBoardTypes(boardId);
  const base = existing.length > 0 ? existing : [...DEFAULT_BOARD_TYPES];
  if (base.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
    saveBoardTypes(boardId, base);
    return base;
  }

  const next = [
    ...base,
    {
      id: `type-${trimmed.toLowerCase().replace(/\s+/g, "-")}-${base.length}`,
      name: trimmed,
      color: opts?.color ?? "#407EC9",
      default_hours: opts?.default_hours ?? 2,
    },
  ];
  saveBoardTypes(boardId, next);
  return next;
}

export function loadBoardTypeAverages(boardId: string): Record<string, number> {
  return Object.fromEntries(
    loadBoardTypes(boardId).map((t) => [t.name, t.default_hours ?? 0])
  );
}

export function getTaskTypeName(typeId: string | null, boardId: string): string | null {
  if (!typeId) return null;
  return loadBoardTypes(boardId).find((t) => t.id === typeId)?.name ?? null;
}

/**
 * A task's effective estimated hours: its own explicit value when set,
 * otherwise the estimate of its task type. Lets tasks "follow the type"
 * automatically while still honoring a manual per-task override.
 */
export function resolveEstimatedHours(
  estimated: number | null | undefined,
  taskTypeName: string | null | undefined,
  hoursByType: Map<string, number>
): number | null {
  if (estimated != null && estimated > 0) return estimated;
  if (taskTypeName && hoursByType.has(taskTypeName)) return hoursByType.get(taskTypeName) ?? null;
  return estimated ?? null;
}
