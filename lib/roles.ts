export type AppRole = "superadmin" | "admin" | "user";

// ── Permission matrix ────────────────────────────────────────────────────────

export type Permission =
  | "access_admin"        // /admin panel — superadmin only
  | "manage_members"      // invite / remove / change roles
  | "manage_boards"       // create / delete / archive boards
  | "manage_company"      // company settings: automations, forms, clients, portals
  | "view_all_data"       // company-wide dashboard, global task list
  | "manage_any_task"     // edit/delete tasks not assigned to them
  | "create_task"         // create new tasks
  | "use_timers";         // play/pause time tracking

const PERMISSIONS: Record<AppRole, Set<Permission>> = {
  superadmin: new Set([
    "access_admin",
    "manage_members",
    "manage_boards",
    "manage_company",
    "view_all_data",
    "manage_any_task",
    "create_task",
    "use_timers",
  ]),
  admin: new Set([
    "manage_boards",
    "manage_company",
    "view_all_data",
    "manage_any_task",
    "create_task",
    "use_timers",
  ]),
  user: new Set([
    "create_task",
    "use_timers",
  ]),
};

export function can(role: AppRole, permission: Permission): boolean {
  return PERMISSIONS[role].has(permission);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  user: "Usuário",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  superadmin: "bg-violet-100 text-violet-700",
  admin: "bg-brand-teal/10 text-brand-teal",
  user: "bg-neutral-100 text-neutral-500",
};
