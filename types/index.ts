import type { Database } from "./database";

export type { Database } from "./database";

// ── Table row shortcuts ───────────────────────────────────────────
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Member = Database["public"]["Tables"]["members"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Column = Database["public"]["Tables"]["columns"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Label = Database["public"]["Tables"]["labels"]["Row"];
export type TaskLabel = Database["public"]["Tables"]["task_labels"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type ChecklistItem = Database["public"]["Tables"]["checklist_items"]["Row"];
export type TaskActivity = Database["public"]["Tables"]["task_activities"]["Row"];
export type Invitation = Database["public"]["Tables"]["invitations"]["Row"];

// ── v2 types ─────────────────────────────────────────────────────
export type TaskType = Database["public"]["Tables"]["task_types"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type TaskAssignee = Database["public"]["Tables"]["task_assignees"]["Row"];
export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];
export type ActiveTimer = Database["public"]["Tables"]["active_timers"]["Row"];
export type SavedFilter = Database["public"]["Tables"]["saved_filters"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type MuralChannel = Database["public"]["Tables"]["mural_channels"]["Row"];
export type MuralPost = Database["public"]["Tables"]["mural_posts"]["Row"];
export type Automation = Database["public"]["Tables"]["automations"]["Row"];

// ── Insert/Update shortcuts ───────────────────────────────────────
export type InsertTask = Database["public"]["Tables"]["tasks"]["Insert"];
export type UpdateTask = Database["public"]["Tables"]["tasks"]["Update"];
export type InsertProject = Database["public"]["Tables"]["projects"]["Insert"];
export type InsertColumn = Database["public"]["Tables"]["columns"]["Insert"];
export type InsertComment = Database["public"]["Tables"]["comments"]["Insert"];

// ── TaskAssignee with profile ─────────────────────────────────────
export type TaskAssigneeWithProfile = TaskAssignee & {
  profile?: Profile | null;
};

// ── Enriched Task (v2) ────────────────────────────────────────────
export type TaskWithRelations = Task & {
  // v1 compat
  assignee?: Profile | null;
  // v2
  assignees?: TaskAssigneeWithProfile[];
  task_type?: TaskType | null;
  requesting_area?: Area | null;
  requested_area?: Area | null;
  labels?: Label[];
  checklist_items?: ChecklistItem[];
  subtasks?: TaskWithRelations[];
  _commentCount?: number;
  _attachmentCount?: number;
  board_project_id?: string | null;
};

export type ColumnWithTasks = Column & {
  tasks: TaskWithRelations[];
};

export type MemberWithProfile = Member & {
  profile?: Profile;
};

// Board presence
export type PresenceUser = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  online_at: string;
};

// ── Priority helpers ──────────────────────────────────────────────
export const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
} as const;

export const PRIORITY_COLORS = {
  low: "#A0A4A8",
  medium: "#407EC9",
  high: "#FFB81C",
  urgent: "#AC145A",
} as const;

export type Priority = Task["priority"];
export type MemberRole = Member["role"];
export type TaskStatus = "open" | "in_progress" | "delivered" | "archived";

// ── Timer helpers ─────────────────────────────────────────────────
export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
