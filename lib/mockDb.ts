/**
 * mockDb — localStorage-backed mock database for development without Supabase.
 * Active when NEXT_PUBLIC_SUPABASE_URL contains "placeholder".
 */

/**
 * Next.js inlines NEXT_PUBLIC_* vars at bundle time, so process.env.NEXT_PUBLIC_SUPABASE_URL
 * becomes a string literal in client code — the `process` object is never accessed at runtime.
 * The old `typeof process !== "undefined"` guard was incorrectly short-circuiting to false.
 */
export const IS_MOCK: boolean =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("placeholder");

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`mwr_${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`mwr_${key}`, JSON.stringify(data));
}

const ORG_ID = "00000000-0000-0000-0000-000000000001";

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface MockProject {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export const mockProjects = {
  list(): MockProject[] {
    return load<MockProject[]>("projects", []).filter((p) => !p.is_archived);
  },

  create(input: { name: string; description?: string; color?: string }): MockProject {
    const now = new Date().toISOString();
    const project: MockProject = {
      id: uuid(),
      org_id: ORG_ID,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? "#00205B",
      is_favorite: false,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };
    const all = load<MockProject[]>("projects", []);
    all.unshift(project);
    save("projects", all);
    return project;
  },

  update(id: string, updates: Partial<MockProject>): void {
    const all = load<MockProject[]>("projects", []);
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      save("projects", all);
    }
  },

  archive(id: string): void {
    this.update(id, { is_archived: true });
  },

  toggleFavorite(id: string): void {
    const all = load<MockProject[]>("projects", []);
    const p = all.find((p) => p.id === id);
    if (p) this.update(id, { is_favorite: !p.is_favorite });
  },
};

// ─── Columns ──────────────────────────────────────────────────────────────────

export interface MockColumn {
  id: string;
  project_id: string;
  org_id: string;
  name: string;
  color: string;
  position: number;
  is_minimized: boolean;
  is_done_column: boolean;
  created_at: string;
  wip_limit?: number | null;
}

const DEFAULT_COLUMNS = [
  { name: "A fazer", color: "#A0A4A8" },
  { name: "Em andamento", color: "#407EC9" },
  { name: "Revisão", color: "#FFB81C" },
  { name: "Concluído", color: "#01CFB5" },
];

export const mockColumns = {
  listByProject(projectId: string): MockColumn[] {
    const all = load<MockColumn[]>("columns", []);
    const proj = all.filter((c) => c.project_id === projectId);

    // Auto-create default columns for new projects
    if (proj.length === 0) {
      const defaults = DEFAULT_COLUMNS.map((col, i) => ({
        id: uuid(),
        project_id: projectId,
        org_id: ORG_ID,
        name: col.name,
        color: col.color,
        position: (i + 1) * 1000,
        is_minimized: false,
        is_done_column: i === DEFAULT_COLUMNS.length - 1,
        created_at: new Date().toISOString(),
      }));
      const updated = [...all, ...defaults];
      save("columns", updated);
      return defaults;
    }

    return proj.sort((a, b) => a.position - b.position);
  },

  create(input: { project_id: string; name: string; color?: string; position: number }): MockColumn {
    const col: MockColumn = {
      id: uuid(),
      org_id: ORG_ID,
      ...input,
      color: input.color ?? "#A0A4A8",
      is_minimized: false,
      is_done_column: false,
      created_at: new Date().toISOString(),
    };
    const all = load<MockColumn[]>("columns", []);
    all.push(col);
    save("columns", all);
    return col;
  },

  update(id: string, updates: Partial<MockColumn>): void {
    const all = load<MockColumn[]>("columns", []);
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      save("columns", all);
    }
  },

  delete(id: string): void {
    const all = load<MockColumn[]>("columns", []);
    save("columns", all.filter((c) => c.id !== id));
    // Also delete tasks in this column
    const tasks = load<MockTask[]>("tasks", []);
    save("tasks", tasks.filter((t) => t.column_id !== id));
  },
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface MockTask {
  id: string;
  project_id: string;
  column_id: string;
  org_id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  position: number;
  assignee_id: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  tracked_hours: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // v2
  is_urgent: boolean;
  status: "open" | "in_progress" | "delivered" | "archived";
  type_id: string | null;
  sla_minutes: number | null;
  parent_task_id: string | null;
  priority_number: number | null;
  requesting_area_id: string | null;
  requested_area_id: string | null;
  desired_start_date: string | null;
  start_date: string | null;
  delivery_date: string | null;
  reopen_count: number;
  reopen_history: Array<{ reopened_at: string; reopened_by: string; days_since_delivery: number }> | null;
  recurrence_config: null;
  board_project_id: string | null;
  capacity_pending?: boolean;
  delivery_link: string | null;
  delivery_note: string | null;
}

export const mockTasks = {
  listByProject(projectId: string): MockTask[] {
    return load<MockTask[]>("tasks", []).filter((t) => t.project_id === projectId);
  },

  create(input: {
    project_id: string;
    column_id: string;
    title: string;
    description?: string;
    priority?: MockTask["priority"];
    due_date?: string;
    desired_start_date?: string;
    estimated_hours?: number | null;
    position?: number;
    assignee_id?: string;
    board_project_id?: string | null;
    type_id?: string | null;
    capacity_pending?: boolean;
  }): MockTask {
    const now = new Date().toISOString();
    const task: MockTask = {
      id: uuid(),
      org_id: ORG_ID,
      project_id: input.project_id,
      column_id: input.column_id,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "medium",
      position: input.position ?? 1000,
      assignee_id: input.assignee_id ?? null,
      due_date: input.due_date ?? null,
      estimated_hours: input.estimated_hours ?? null,
      tracked_hours: 0,
      created_by: null,
      created_at: now,
      updated_at: now,
      is_urgent: false,
      status: "open",
      type_id: input.type_id ?? null,
      sla_minutes: null,
      parent_task_id: null,
      priority_number: null,
      requesting_area_id: null,
      requested_area_id: null,
      desired_start_date: input.desired_start_date ?? null,
      start_date: null,
      delivery_date: null,
      reopen_count: 0,
      reopen_history: null,
      recurrence_config: null,
      board_project_id: input.board_project_id ?? null,
      capacity_pending: input.capacity_pending ?? false,
      delivery_link: null,
      delivery_note: null,
    };
    const all = load<MockTask[]>("tasks", []);
    all.push(task);
    save("tasks", all);
    return task;
  },

  update(id: string, updates: Partial<MockTask>): void {
    const all = load<MockTask[]>("tasks", []);
    const idx = all.findIndex((t) => t.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      save("tasks", all);
    }
  },

  delete(id: string): void {
    const all = load<MockTask[]>("tasks", []);
    save("tasks", all.filter((t) => t.id !== id));
  },

  deleteMany(ids: string[]): void {
    const all = load<MockTask[]>("tasks", []);
    save("tasks", all.filter((t) => !ids.includes(t.id)));
  },

  get(id: string): MockTask | null {
    return load<MockTask[]>("tasks", []).find((t) => t.id === id) ?? null;
  },
  listAll(): MockTask[] {
    return load<MockTask[]>("tasks", []);
  },
};

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface MockComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { id: string; full_name: string; avatar_url: string | null };
}

export const mockComments = {
  listByTask(taskId: string): MockComment[] {
    return load<MockComment[]>("comments", [])
      .filter((c) => c.task_id === taskId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  create(taskId: string, content: string): MockComment {
    const comment: MockComment = {
      id: uuid(),
      task_id: taskId,
      user_id: "mock-user",
      content,
      created_at: new Date().toISOString(),
      profiles: { id: "mock-user", full_name: "Você (demo)", avatar_url: null },
    };
    const all = load<MockComment[]>("comments", []);
    all.push(comment);
    save("comments", all);
    return comment;
  },

  delete(id: string): void {
    const all = load<MockComment[]>("comments", []);
    save("comments", all.filter((c) => c.id !== id));
  },
};

// ─── Active Timers ─────────────────────────────────────────────────────────────

export interface MockActiveTimer {
  user_id: string;
  task_id: string;
  started_at: string;
}

export const mockTimers = {
  get(userId: string): MockActiveTimer | null {
    const all = load<MockActiveTimer[]>("timers", []);
    return all.find((t) => t.user_id === userId) ?? null;
  },

  start(userId: string, taskId: string): MockActiveTimer {
    const timer: MockActiveTimer = {
      user_id: userId,
      task_id: taskId,
      started_at: new Date().toISOString(),
    };
    const all = load<MockActiveTimer[]>("timers", []).filter((t) => t.user_id !== userId);
    all.push(timer);
    save("timers", all);
    return timer;
  },

  stop(userId: string): MockActiveTimer | null {
    const all = load<MockActiveTimer[]>("timers", []);
    const timer = all.find((t) => t.user_id === userId) ?? null;
    save("timers", all.filter((t) => t.user_id !== userId));
    return timer;
  },
};

// ─── Saved Filters ──────────────────────────────────────────────────────────────

export interface MockSavedFilter {
  id: string;
  board_id: string | null;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export const mockSavedFilters = {
  listByBoard(boardId: string): MockSavedFilter[] {
    return load<MockSavedFilter[]>("saved_filters", []).filter(
      (f) => f.board_id === boardId || f.board_id === null
    );
  },

  create(boardId: string, name: string, filters: Record<string, unknown>): MockSavedFilter {
    const item: MockSavedFilter = {
      id: uuid(),
      board_id: boardId,
      user_id: "mock-user",
      name,
      filters,
      created_at: new Date().toISOString(),
    };
    const all = load<MockSavedFilter[]>("saved_filters", []);
    all.push(item);
    save("saved_filters", all);
    return item;
  },

  delete(id: string): void {
    const all = load<MockSavedFilter[]>("saved_filters", []);
    save("saved_filters", all.filter((f) => f.id !== id));
  },
};

// ─── Time Entries (timesheet) ────────────────────────────────────────────────────

export interface MockTimeEntry {
  id: string;
  user_id: string;
  task_id: string | null;
  date: string; // YYYY-MM-DD
  minutes: number;
  note: string | null;
  created_at: string;
}

export const mockTimeEntries = {
  list(userId: string): MockTimeEntry[] {
    return load<MockTimeEntry[]>("time_entries", []).filter((e) => e.user_id === userId);
  },

  add(userId: string, taskId: string | null, minutes: number, date: string, note?: string): MockTimeEntry {
    const entry: MockTimeEntry = {
      id: uuid(),
      user_id: userId,
      task_id: taskId,
      date,
      minutes,
      note: note ?? null,
      created_at: new Date().toISOString(),
    };
    const all = load<MockTimeEntry[]>("time_entries", []);
    all.push(entry);
    save("time_entries", all);
    return entry;
  },

  /** Total minutes per date (YYYY-MM-DD) for a user. */
  minutesByDate(userId: string): Record<string, number> {
    const map: Record<string, number> = {};
    this.list(userId).forEach((e) => {
      map[e.date] = (map[e.date] ?? 0) + e.minutes;
    });
    return map;
  },
};

// ─── Task Sequences (fila de responsáveis) ──────────────────────────────────────

export interface MockTaskSequence {
  id: string;
  task_id: string;
  user_id: string;
  name: string;
  order_position: number;
  status: "pending" | "active" | "done";
}

export const mockTaskSequences = {
  listByTask(taskId: string): MockTaskSequence[] {
    return load<MockTaskSequence[]>("task_sequences", [])
      .filter((s) => s.task_id === taskId)
      .sort((a, b) => a.order_position - b.order_position);
  },

  add(taskId: string, userId: string, name: string): MockTaskSequence {
    const all = load<MockTaskSequence[]>("task_sequences", []);
    const existing = all.filter((s) => s.task_id === taskId);
    const item: MockTaskSequence = {
      id: uuid(),
      task_id: taskId,
      user_id: userId,
      name,
      order_position: existing.length,
      status: existing.length === 0 ? "active" : "pending",
    };
    all.push(item);
    save("task_sequences", all);
    return item;
  },

  remove(id: string): void {
    const all = load<MockTaskSequence[]>("task_sequences", []);
    save("task_sequences", all.filter((s) => s.id !== id));
  },

  reorder(taskId: string, orderedIds: string[]): void {
    const all = load<MockTaskSequence[]>("task_sequences", []);
    orderedIds.forEach((id, i) => {
      const item = all.find((s) => s.id === id);
      if (item) item.order_position = i;
    });
    save("task_sequences", all);
  },

  /** Marks the current active one done and activates the next; returns the newly active item. */
  advance(taskId: string): MockTaskSequence | null {
    const all = load<MockTaskSequence[]>("task_sequences", []);
    const seq = all.filter((s) => s.task_id === taskId).sort((a, b) => a.order_position - b.order_position);
    const activeIdx = seq.findIndex((s) => s.status === "active");
    if (activeIdx === -1) return null;
    seq[activeIdx].status = "done";
    const next = seq[activeIdx + 1] ?? null;
    if (next) next.status = "active";
    save("task_sequences", all);
    return next;
  },
};

// ─── Task Dependencies (pré-requisitos / subsequentes) ───────────────────────────

export interface MockTaskDependency {
  id: string;
  task_id: string;
  dependency_task_id: string;
  dependency_task_title: string | null;
  dependency_board_id: string | null;
  dependency_board_name: string | null;
  type: "prerequisite" | "subsequent";
}

export const mockTaskDependencies = {
  listByTask(taskId: string): MockTaskDependency[] {
    return load<MockTaskDependency[]>("task_dependencies", []).filter((d) => d.task_id === taskId);
  },

  add(
    taskId: string,
    dependencyTaskId: string,
    type: MockTaskDependency["type"],
    meta?: { title?: string; boardId?: string; boardName?: string }
  ): MockTaskDependency {
    const all = load<MockTaskDependency[]>("task_dependencies", []);
    const exists = all.find(
      (d) => d.task_id === taskId && d.dependency_task_id === dependencyTaskId && d.type === type
    );
    if (exists) return exists;
    const item: MockTaskDependency = {
      id: uuid(),
      task_id: taskId,
      dependency_task_id: dependencyTaskId,
      dependency_task_title: meta?.title ?? null,
      dependency_board_id: meta?.boardId ?? null,
      dependency_board_name: meta?.boardName ?? null,
      type,
    };
    all.push(item);
    save("task_dependencies", all);
    return item;
  },

  remove(id: string): void {
    const all = load<MockTaskDependency[]>("task_dependencies", []);
    save("task_dependencies", all.filter((d) => d.id !== id));
  },
};

// ─── Task Approvals ──────────────────────────────────────────────────────────────

export interface MockTaskApproval {
  id: string;
  task_id: string;
  task_title: string;
  approver: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected" | "adjustment";
  comment: string | null;
  requested_at: string;
  resolved_at: string | null;
}

export const mockTaskApprovals = {
  list(): MockTaskApproval[] {
    return load<MockTaskApproval[]>("task_approvals", []);
  },
  getForTask(taskId: string): MockTaskApproval | null {
    return this.list().filter((a) => a.task_id === taskId).sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0] ?? null;
  },
  listForTask(taskId: string): MockTaskApproval[] {
    return this.list().filter((a) => a.task_id === taskId).sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  },
  listByApprover(approver: string): MockTaskApproval[] {
    return this.list().filter((a) => a.approver === approver).sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  },
  request(taskId: string, taskTitle: string, approver: string, requestedBy: string): MockTaskApproval {
    const item: MockTaskApproval = {
      id: uuid(), task_id: taskId, task_title: taskTitle, approver, requested_by: requestedBy,
      status: "pending", comment: null, requested_at: new Date().toISOString(), resolved_at: null,
    };
    const all = this.list();
    // supersede any existing pending for this task
    const cleaned = all.filter((a) => !(a.task_id === taskId && a.status === "pending"));
    cleaned.push(item);
    save("task_approvals", cleaned);
    return item;
  },
  resolve(id: string, status: "approved" | "rejected" | "adjustment" | "adjustment", comment: string): void {
    const all = this.list();
    const idx = all.findIndex((a) => a.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], status, comment: comment || null, resolved_at: new Date().toISOString() };
      save("task_approvals", all);
    }
  },
};

// ─── Automations ────────────────────────────────────────────────────────────────

export interface MockAutomationAction {
  type: string;
  config: Record<string, unknown>;
}
export interface MockAutomationLog {
  at: string;
  task: string;
  status: "success" | "error";
  message: string;
}
export interface MockAutomation {
  id: string;
  name: string;
  board: string;
  trigger: string;
  trigger_config: Record<string, unknown>;
  actions: MockAutomationAction[];
  is_active: boolean;
  executions: number;
  logs: MockAutomationLog[];
}

const SEED_AUTOMATIONS: MockAutomation[] = [
  {
    id: "auto-1", name: "Notificar ao ultrapassar prazo", board: "Marketing Digital",
    trigger: "due_date_near", trigger_config: { days: 1 },
    actions: [{ type: "send_notification", config: {} }],
    is_active: true, executions: 12,
    logs: [
      { at: "2026-06-20T09:12:00Z", task: "Gravar vídeo", status: "success", message: "Notificação enviada" },
      { at: "2026-06-18T14:30:00Z", task: "Editar legenda", status: "success", message: "Notificação enviada" },
    ],
  },
  {
    id: "auto-2", name: "Alocar responsável ao criar tarefa", board: "Marketing Digital",
    trigger: "task_created", trigger_config: {},
    actions: [{ type: "assign_user", config: { users: ["Ana Souza"] } }, { type: "add_tag", config: { tag: "Triagem" } }],
    is_active: true, executions: 34,
    logs: [{ at: "2026-06-21T08:00:00Z", task: "Planejar sprint", status: "success", message: "Ana alocada + tag Triagem" }],
  },
  {
    id: "auto-3", name: "Mover para Revisão ao entregar", board: "Marketing Digital",
    trigger: "task_delivered", trigger_config: {},
    actions: [{ type: "move_to_stage", config: { stage: "Revisão" } }],
    is_active: false, executions: 5, logs: [],
  },
];

export const mockAutomations = {
  list(): MockAutomation[] {
    const stored = load<MockAutomation[] | null>("automations", null);
    if (stored === null) {
      save("automations", SEED_AUTOMATIONS);
      return SEED_AUTOMATIONS;
    }
    return stored;
  },
  create(input: Omit<MockAutomation, "id" | "executions" | "logs">): MockAutomation {
    const item: MockAutomation = { ...input, id: uuid(), executions: 0, logs: [] };
    const all = this.list();
    all.unshift(item);
    save("automations", all);
    return item;
  },
  update(id: string, updates: Partial<MockAutomation>): void {
    const all = this.list();
    const idx = all.findIndex((a) => a.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; save("automations", all); }
  },
  delete(id: string): void {
    save("automations", this.list().filter((a) => a.id !== id));
  },
};

// ─── Mural Posts ────────────────────────────────────────────────────────────────

export interface MockMuralPost {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
}

export const mockMuralPosts = {
  listByChannel(channelId: string): MockMuralPost[] {
    return load<MockMuralPost[]>("mural_posts", [])
      .filter((p) => p.channel_id === channelId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  create(channelId: string, content: string, authorName: string): MockMuralPost {
    const post: MockMuralPost = {
      id: uuid(),
      channel_id: channelId,
      user_id: "mock-user",
      content,
      created_at: new Date().toISOString(),
      author_name: authorName,
      author_avatar: null,
    };
    const all = load<MockMuralPost[]>("mural_posts", []);
    all.push(post);
    save("mural_posts", all);
    return post;
  },
};

// ─── Board Projects ────────────────────────────────────────────────────────────

export interface MockBoardProject {
  id: string;
  board_id: string;
  name: string;
  color: string;
  description?: string;
  created_at: string;
}

export const boardProjectDb = {
  listByBoard(boardId: string): MockBoardProject[] {
    return load<MockBoardProject[]>(`board_projects_${boardId}`, []);
  },

  create(input: { board_id: string; name: string; color: string; description?: string }): MockBoardProject {
    const project: MockBoardProject = {
      id: uuid(),
      board_id: input.board_id,
      name: input.name,
      color: input.color,
      description: input.description,
      created_at: new Date().toISOString(),
    };
    const all = this.listByBoard(input.board_id);
    all.push(project);
    save(`board_projects_${input.board_id}`, all);
    return project;
  },

  update(boardId: string, id: string, updates: Partial<Pick<MockBoardProject, "name" | "color" | "description">>): void {
    const all = this.listByBoard(boardId);
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      save(`board_projects_${boardId}`, all);
    }
  },

  delete(boardId: string, id: string): void {
    const all = this.listByBoard(boardId).filter((p) => p.id !== id);
    save(`board_projects_${boardId}`, all);
  },
};

// ─── Tempo Líquido ─────────────────────────────────────────────────────────────

export interface MockLiquidTime {
  user_id: string;
  hours_per_week: number;
  updated_at: string;
}

export const mockLiquidTime = {
  list(): MockLiquidTime[] {
    return load<MockLiquidTime[]>("liquid_time", []);
  },
  get(userId: string): MockLiquidTime | null {
    return this.list().find((e) => e.user_id === userId) ?? null;
  },
  set(userId: string, hoursPerWeek: number): void {
    const all = this.list().filter((e) => e.user_id !== userId);
    all.push({ user_id: userId, hours_per_week: hoursPerWeek, updated_at: new Date().toISOString() });
    save("liquid_time", all);
  },
};

// ─── Histórico de tipos por usuário ────────────────────────────────────────────

export interface MockTypeHistoryEntry {
  id: string;
  user_id: string;
  type_name: string;
  board_id: string;
  total_hours: number;
  count: number;
  updated_at: string;
}

export const mockTypeHistory = {
  listByBoard(boardId: string): MockTypeHistoryEntry[] {
    return load<MockTypeHistoryEntry[]>(`type_history_${boardId}`, []);
  },
  recordDelivery(boardId: string, userId: string, typeName: string, hours: number): void {
    const all = this.listByBoard(boardId);
    const idx = all.findIndex((e) => e.user_id === userId && e.type_name === typeName);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        total_hours: all[idx].total_hours + hours,
        count: all[idx].count + 1,
        updated_at: new Date().toISOString(),
      };
    } else {
      all.push({
        id: uuid(),
        user_id: userId,
        type_name: typeName,
        board_id: boardId,
        total_hours: hours,
        count: 1,
        updated_at: new Date().toISOString(),
      });
    }
    save(`type_history_${boardId}`, all);
  },
};

// ─── Solicitações de capacidade ────────────────────────────────────────────────

export interface MockCapacityRequest {
  id: string;
  task_id: string;
  task_title: string;
  assignee_id: string;
  week_start: string;
  board_id: string;
  projected_hours: number;
  liquid_hours: number;
  overflow_hours: number;
  status: "pending" | "approved" | "reallocated" | "declined";
  leader_id: string | null;
  comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

export const mockCapacityRequests = {
  list(): MockCapacityRequest[] {
    return load<MockCapacityRequest[]>("capacity_requests", []);
  },
  getForTask(taskId: string): MockCapacityRequest | null {
    return this.list().find((r) => r.task_id === taskId && r.status === "pending") ?? null;
  },
  create(input: Omit<MockCapacityRequest, "id" | "created_at" | "resolved_at" | "status">): MockCapacityRequest {
    const all = this.list().filter((r) => r.task_id !== input.task_id);
    const req: MockCapacityRequest = {
      ...input,
      id: uuid(),
      status: "pending",
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
    all.push(req);
    save("capacity_requests", all);
    return req;
  },
  resolve(id: string, status: "approved" | "reallocated" | "declined", comment?: string): void {
    const all = this.list();
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        status,
        comment: comment ?? null,
        resolved_at: new Date().toISOString(),
      };
      save("capacity_requests", all);
    }
  },
};
