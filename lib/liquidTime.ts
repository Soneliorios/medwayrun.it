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

export function loadBoardTypes(boardId: string): BoardTaskType[] {
  try {
    const raw = localStorage.getItem(`mwr_task_types_${boardId}`);
    if (!raw) return [];
    return JSON.parse(raw) as BoardTaskType[];
  } catch {
    return [];
  }
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
