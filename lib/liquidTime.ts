import {
  mockLiquidTime,
  mockTypeHistory,
  mockCapacityRequests,
  type MockTask,
} from "./mockDb";

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

// ─── Board type config ────────────────────────────────────────────────────────

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

// ─── Effective hours (chain: tracked → estimated → user_avg → board_avg → 0) ─

export function getTaskEffectiveHours(
  task: MockTask,
  typeName: string | null,
  opts: { boardTypeAverages?: Record<string, number>; userAvg?: number }
): number {
  if (task.tracked_hours > 0) return task.tracked_hours;
  if (task.estimated_hours && task.estimated_hours > 0) return task.estimated_hours;
  if (opts.userAvg && opts.userAvg > 0) return opts.userAvg;
  if (typeName && opts.boardTypeAverages?.[typeName]) return opts.boardTypeAverages[typeName];
  return 0;
}

// ─── Projected hours for a new assignment (conservative: max of options) ──────

export function getNewTaskProjectedHours(
  task: MockTask,
  userId: string,
  boardId: string,
  boardTypeAverages: Record<string, number>
): number {
  const estimated = task.estimated_hours ?? 0;
  const typeName = getTaskTypeName(task.type_id, boardId);
  const history = mockTypeHistory.listByBoard(boardId);
  const entry = history.find((h) => h.user_id === userId && h.type_name === typeName);
  const userAvg = entry && entry.count > 0 ? entry.total_hours / entry.count : 0;
  const typeAvg = typeName ? (boardTypeAverages[typeName] ?? 0) : 0;
  return Math.max(estimated, userAvg > 0 ? userAvg : typeAvg);
}

// ─── Weekly capacity result ───────────────────────────────────────────────────

export interface WeeklyCapacityTaskEntry {
  task: MockTask;
  hours: number;
  source: "tracked" | "estimated" | "user_avg" | "board_avg" | "none";
}

export interface WeeklyCapacityResult {
  liquidHours: number;
  allocatedHours: number;
  overflowHours: number;
  tasks: WeeklyCapacityTaskEntry[];
}

export function getUserWeekCapacity(
  userId: string,
  weekStart: string,
  allTasks: MockTask[],
  boardId: string,
  boardTypeAverages: Record<string, number>
): WeeklyCapacityResult {
  const config = mockLiquidTime.get(userId);
  const liquidHours = config?.hours_per_week ?? 0;
  const history = mockTypeHistory.listByBoard(boardId);

  const weekTasks = allTasks.filter((t) => {
    if (t.assignee_id !== userId) return false;
    if (!t.desired_start_date) return false;
    return getMondayOfWeek(t.desired_start_date) === weekStart;
  });

  const taskEntries: WeeklyCapacityTaskEntry[] = weekTasks.map((task) => {
    const typeName = getTaskTypeName(task.type_id, boardId);
    const entry = history.find((h) => h.user_id === userId && h.type_name === typeName);
    const userAvg = entry && entry.count > 0 ? entry.total_hours / entry.count : 0;
    const typeAvg = typeName ? (boardTypeAverages[typeName] ?? 0) : 0;

    if (task.tracked_hours > 0) return { task, hours: task.tracked_hours, source: "tracked" };
    if (task.estimated_hours && task.estimated_hours > 0) return { task, hours: task.estimated_hours, source: "estimated" };
    if (userAvg > 0) return { task, hours: userAvg, source: "user_avg" };
    if (typeAvg > 0) return { task, hours: typeAvg, source: "board_avg" };
    return { task, hours: 0, source: "none" };
  });

  const allocatedHours = taskEntries.reduce((s, e) => s + e.hours, 0);
  const overflowHours = Math.max(0, allocatedHours - liquidHours);

  return { liquidHours, allocatedHours, overflowHours, tasks: taskEntries };
}

// ─── Overflow check at assignment time ───────────────────────────────────────

export interface OverflowCheckResult {
  overflows: boolean;
  allocatedHours: number;
  projectedHours: number;
  liquidHours: number;
  newTotalHours: number;
  weekStart: string;
}

export function checkCapacityOverflow(
  newTask: MockTask,
  userId: string,
  boardId: string,
  allTasks: MockTask[],
  boardTypeAverages: Record<string, number>
): OverflowCheckResult | null {
  if (!newTask.desired_start_date) return null;
  const weekStart = getMondayOfWeek(newTask.desired_start_date);
  // Exclude the task itself from current allocation (in case it's already assigned)
  const otherTasks = allTasks.filter((t) => t.id !== newTask.id);
  const current = getUserWeekCapacity(userId, weekStart, otherTasks, boardId, boardTypeAverages);
  const projected = getNewTaskProjectedHours(newTask, userId, boardId, boardTypeAverages);
  const newTotal = current.allocatedHours + projected;
  return {
    overflows: current.liquidHours > 0 && newTotal > current.liquidHours,
    allocatedHours: current.allocatedHours,
    projectedHours: projected,
    liquidHours: current.liquidHours,
    newTotalHours: newTotal,
    weekStart,
  };
}

// ─── Delivery history recording ───────────────────────────────────────────────

export function recordDeliveryHistory(task: MockTask, boardId: string): void {
  if (!task.assignee_id) return;
  const typeName = getTaskTypeName(task.type_id, boardId);
  if (!typeName) return;

  let hours = 0;
  if (task.tracked_hours > 0) hours = task.tracked_hours;
  else if (task.estimated_hours && task.estimated_hours > 0) hours = task.estimated_hours;
  else return;

  mockTypeHistory.recordDelivery(boardId, task.assignee_id, typeName, hours);
}

// ─── Helper to find leader for a board/task (used to notify on overflow) ─────

export function findTeamLeaderForUser(userId: string): string | null {
  try {
    const raw = localStorage.getItem("mwr_teams");
    if (!raw) return null;
    const teams = JSON.parse(raw) as Array<{ leader_id: string; member_ids: string[] }>;
    const team = teams.find((t) => t.member_ids.includes(userId));
    return team?.leader_id ?? null;
  } catch {
    return null;
  }
}

// ─── Re-export mockCapacityRequests for convenience ───────────────────────────
export { mockCapacityRequests };
