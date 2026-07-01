"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Users, LayoutGrid, ChevronDown, Check, Lock,
  Plus, Trash2, Crown, X, UserPlus, Ban, ShieldCheck, ShieldOff, UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/features/auth/hooks/useRole";
import { IS_MOCK, mockLiquidTime } from "@/lib/mockDb";
import {
  type AppRole,
  ROLE_LABELS,
  ROLE_COLORS,
  getMockRole,
  setMockRole,
} from "@/lib/roles";
import {
  type MockUser,
  type MockUserRole,
  getAllMockUsers,
  updateMockUserRole,
  removeMockUser,
} from "@/lib/mockUsers";

// ── Types ──────────────────────────────────────────────────────────────────────

const USERS_KEY = "mwr_admin_users";
const TEAMS_KEY = "mwr_teams";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  avatar: string | null;
}

interface MockTeam {
  id: string;
  name: string;
  leader_id: string;
  member_ids: string[];
}

type AdminTab = "overview" | "users" | "teams";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function nanoid6() {
  return Math.random().toString(36).slice(2, 8);
}

// Users
function loadUsers(): AdminUser[] {
  if (typeof window === "undefined") return defaultUsers();
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const d = defaultUsers();
  localStorage.setItem(USERS_KEY, JSON.stringify(d));
  return d;
}
function defaultUsers(): AdminUser[] {
  return [
    { id: "mock-user", name: "Você (demo)", email: "voce@medway.com", role: "superadmin", avatar: null },
    { id: "u-ana",     name: "Ana Souza",   email: "ana@medway.com",   role: "admin",      avatar: null },
    { id: "u-bruno",   name: "Bruno Lima",  email: "bruno@medway.com", role: "admin",      avatar: null },
    { id: "u-carla",   name: "Carla Dias",  email: "carla@medway.com", role: "user",       avatar: null },
    { id: "u-diego",   name: "Diego Reis",  email: "diego@medway.com", role: "user",       avatar: null },
  ];
}
function saveUsers(u: AdminUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}

// Teams
function loadTeams(): MockTeam[] {
  if (typeof window === "undefined") return defaultTeams();
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const d = defaultTeams();
  localStorage.setItem(TEAMS_KEY, JSON.stringify(d));
  return d;
}
function defaultTeams(): MockTeam[] {
  return [
    { id: "team-demo", name: "Meu Time (Demo)",    leader_id: "mock-user", member_ids: ["mock-user", "u-carla"] },
    { id: "team-mkt",  name: "Time de Marketing",  leader_id: "u-ana",     member_ids: ["u-ana", "u-carla"]     },
    { id: "team-prod", name: "Time de Produto",    leader_id: "u-bruno",   member_ids: ["u-bruno", "u-diego"]   },
  ];
}
function saveTeams(t: MockTeam[]) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(t));
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { isSuperAdmin, isAdmin } = useRole();

  const [users, setUsers] = useState<AdminUser[]>(() =>
    typeof window !== "undefined" ? loadUsers() : []
  );
  const [teams, setTeams] = useState<MockTeam[]>(() =>
    typeof window !== "undefined" ? loadTeams() : []
  );
  const [boards] = useState<{ id: string; name: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mwr_projects") ?? "[]"); } catch { return []; }
  });

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<AppRole>(() => IS_MOCK ? getMockRole() : "superadmin");

  // Real registered users (from mockUsers.ts)
  const [mockUsers, setMockUsers] = useState<MockUser[]>(() =>
    typeof window !== "undefined" ? getAllMockUsers() : []
  );
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  function refreshMockUsers() {
    setMockUsers(getAllMockUsers());
  }

  function handleMockUserRole(id: string, role: MockUserRole) {
    updateMockUserRole(id, role);
    refreshMockUsers();
    setOpenPicker(null);
  }

  function handleRemoveMockUser(id: string) {
    removeMockUser(id);
    setConfirmRevoke(null);
    refreshMockUsers();
  }

  function handleRevokeMockUser(id: string) {
    updateMockUserRole(id, "revoked");
    setConfirmRevoke(null);
    refreshMockUsers();
  }

  // Liquid time h/sem per member
  const [liquidTimeMap, setLiquidTimeMap] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    return Object.fromEntries(mockLiquidTime.list().map((e) => [e.user_id, e.hours_per_week]));
  });

  // Teams state
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLeaderId, setNewTeamLeaderId] = useState("");
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamNameValue, setEditTeamNameValue] = useState("");

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) router.replace("/boards");
  }, [isAdmin, router]);

  // Admin (non-super) lands on Times tab
  useEffect(() => {
    if (!isSuperAdmin) setActiveTab("teams");
  }, [isSuperAdmin]);

  useEffect(() => {
    const h = () => setCurrentRole(getMockRole());
    window.addEventListener("mwr_role_change", h);
    return () => window.removeEventListener("mwr_role_change", h);
  }, []);

  // Close pickers on outside click
  useEffect(() => {
    if (!openPicker && !addMemberTeamId) return;
    function h(e: MouseEvent) {
      const el = e.target as Node;
      const inside = Array.from(document.querySelectorAll("[data-picker-container]")).some(
        (c) => c.contains(el)
      );
      if (!inside) {
        setOpenPicker(null);
        setAddMemberTeamId(null);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openPicker, addMemberTeamId]);

  if (!isAdmin) return null;

  // Current user id (mock mode = "mock-user")
  const currentUserId = IS_MOCK ? "mock-user" : "";

  // ── Users actions
  function changeRole(userId: string, role: AppRole) {
    const updated = users.map((u) => u.id === userId ? { ...u, role } : u);
    setUsers(updated);
    saveUsers(updated);
    setOpenPicker(null);
    if (IS_MOCK && userId === "mock-user") setMockRole(role);
  }

  // ── Teams actions
  function createTeam() {
    if (!newTeamName.trim() || !newTeamLeaderId) return;
    const team: MockTeam = {
      id: "team-" + nanoid6(),
      name: newTeamName.trim(),
      leader_id: newTeamLeaderId,
      member_ids: [newTeamLeaderId],
    };
    const updated = [...teams, team];
    setTeams(updated);
    saveTeams(updated);
    setShowNewTeam(false);
    setNewTeamName("");
    setNewTeamLeaderId("");
  }

  function deleteTeam(teamId: string) {
    const updated = teams.filter((t) => t.id !== teamId);
    setTeams(updated);
    saveTeams(updated);
  }

  function addMember(teamId: string, userId: string) {
    const updated = teams.map((t) =>
      t.id === teamId && !t.member_ids.includes(userId)
        ? { ...t, member_ids: [...t.member_ids, userId] }
        : t
    );
    setTeams(updated);
    saveTeams(updated);
    setAddMemberTeamId(null);
  }

  function removeMember(teamId: string, userId: string) {
    const updated = teams.map((t) =>
      t.id === teamId
        ? { ...t, member_ids: t.member_ids.filter((id) => id !== userId) }
        : t
    );
    setTeams(updated);
    saveTeams(updated);
  }

  function changeLeader(teamId: string, userId: string) {
    const updated = teams.map((t) => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        leader_id: userId,
        member_ids: t.member_ids.includes(userId) ? t.member_ids : [...t.member_ids, userId],
      };
    });
    setTeams(updated);
    saveTeams(updated);
    setOpenPicker(null);
  }

  function saveTeamName(teamId: string) {
    if (!editTeamNameValue.trim()) { setEditingTeamId(null); return; }
    const updated = teams.map((t) =>
      t.id === teamId ? { ...t, name: editTeamNameValue.trim() } : t
    );
    setTeams(updated);
    saveTeams(updated);
    setEditingTeamId(null);
  }

  function saveLiquidHours(userId: string, raw: string) {
    const hours = Math.max(0, parseFloat(raw) || 0);
    mockLiquidTime.set(userId, hours);
    setLiquidTimeMap((prev) => ({ ...prev, [userId]: hours }));
  }

  // ── Derived
  const byRole = (r: AppRole) => users.filter((u) => u.role === r);
  const admins = users.filter((u) => u.role === "admin" || u.role === "superadmin");
  // Admin sees only their team; superadmin sees all
  const visibleTeams = isSuperAdmin
    ? teams
    : teams.filter((t) => t.leader_id === currentUserId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-neutral-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Shield size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brand-navy">Painel Admin</h1>
            <p className="text-sm text-neutral-500">
              {isSuperAdmin
                ? "Gestão de usuários, times e visão geral do sistema"
                : "Gestão do seu time"}
            </p>
          </div>
          {IS_MOCK && (
            <div className="ml-auto flex items-center gap-2 text-xs text-neutral-400 bg-white border border-neutral-200 rounded-lg px-3 py-1.5">
              <span>Sessão atual:</span>
              <span className={cn("px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[currentRole])}>
                {ROLE_LABELS[currentRole]}
              </span>
            </div>
          )}
        </div>

        {/* Tab nav — only for superadmin */}
        {isSuperAdmin && (
          <div className="flex border-b border-neutral-200 -mb-2">
            {([
              { id: "overview" as AdminTab, label: "Visão Geral" },
              { id: "users"    as AdminTab, label: "Usuários" },
              { id: "teams"    as AdminTab, label: "Times" },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === tab.id
                    ? "border-brand-teal text-brand-teal"
                    : "border-transparent text-neutral-400 hover:text-neutral-600"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: Visão Geral                                                    */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && isSuperAdmin && (
          <div className="space-y-8 pt-2">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {([
                { label: "Super Admins", count: byRole("superadmin").length, color: "text-violet-600", bg: "bg-violet-50" },
                { label: "Admins",       count: byRole("admin").length,      color: "text-brand-teal", bg: "bg-brand-teal/5" },
                { label: "Usuários",     count: byRole("user").length,       color: "text-neutral-600", bg: "bg-neutral-50" },
              ] as const).map(({ label, count, color, bg }) => (
                <div key={label} className={cn("rounded-xl border border-neutral-100 p-4", bg)}>
                  <p className={cn("text-2xl font-bold", color)}>{count}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Users table */}
            <section className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                <Users size={15} className="text-neutral-400" />
                <h2 className="text-sm font-semibold text-brand-navy">Membros da organização</h2>
                <span className="ml-auto text-xs text-neutral-400">{users.length} membros</span>
              </div>
              <div className="divide-y divide-neutral-50">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center text-[11px] font-bold text-brand-navy shrink-0">
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{u.name}</p>
                      <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                    </div>
                    <div className="relative shrink-0" data-picker-container>
                      <button
                        onClick={() => setOpenPicker(openPicker === u.id ? null : u.id)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
                          ROLE_COLORS[u.role], "border-transparent hover:border-current/20"
                        )}
                      >
                        {ROLE_LABELS[u.role]}
                        <ChevronDown size={11} />
                      </button>
                      {openPicker === u.id && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-20">
                          {(["superadmin", "admin", "user"] as AppRole[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => changeRole(u.id, r)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors"
                            >
                              <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", ROLE_COLORS[r])}>
                                {ROLE_LABELS[r]}
                              </span>
                              {u.role === r && <Check size={12} className="ml-auto text-brand-teal" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Boards */}
            {boards.length > 0 && (
              <section className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                  <LayoutGrid size={15} className="text-neutral-400" />
                  <h2 className="text-sm font-semibold text-brand-navy">Quadros da organização</h2>
                  <span className="ml-auto text-xs text-neutral-400">{boards.length} quadros</span>
                </div>
                <div className="divide-y divide-neutral-50">
                  {boards.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-7 h-7 rounded-lg bg-brand-navy/5 flex items-center justify-center shrink-0">
                        <LayoutGrid size={13} className="text-brand-navy/40" />
                      </div>
                      <p className="text-sm text-neutral-700 flex-1">{b.name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Permissions matrix */}
            <section className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                <Lock size={15} className="text-neutral-400" />
                <h2 className="text-sm font-semibold text-brand-navy">Matriz de permissões</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-neutral-400 w-64">Ação</th>
                      {(["superadmin", "admin", "user"] as AppRole[]).map((r) => (
                        <th key={r} className={cn("px-4 py-2.5 text-xs font-semibold text-center", ROLE_COLORS[r].split(" ")[1])}>
                          {ROLE_LABELS[r]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {[
                      { label: "Painel /admin",                  superadmin: true,  admin: true,  user: false },
                      { label: "Gerenciar membros e papéis",     superadmin: true,  admin: false, user: false },
                      { label: "Gerenciar times",                superadmin: true,  admin: true,  user: false },
                      { label: "Criar / excluir quadros",        superadmin: true,  admin: true,  user: false },
                      { label: "Configurações da empresa",       superadmin: true,  admin: true,  user: false },
                      { label: "Automações e formulários",       superadmin: true,  admin: true,  user: false },
                      { label: "Ver dados globais (dashboard)",  superadmin: true,  admin: true,  user: false },
                      { label: "Editar / excluir qualquer task", superadmin: true,  admin: true,  user: false },
                      { label: "Criar tarefas",                  superadmin: true,  admin: true,  user: true  },
                      { label: "Registrar tempo (timer)",        superadmin: true,  admin: true,  user: true  },
                    ].map((row) => (
                      <tr key={row.label} className="hover:bg-neutral-50/50">
                        <td className="px-5 py-2.5 text-neutral-700">{row.label}</td>
                        {(["superadmin", "admin", "user"] as const).map((r) => (
                          <td key={r} className="px-4 py-2.5 text-center">
                            {row[r]
                              ? <span className="text-green-500 text-base">✓</span>
                              : <span className="text-neutral-200 text-base">✗</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: Usuários                                                       */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "users" && isSuperAdmin && (
          <div className="space-y-5 pt-2">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {([
                { label: "Super Admins", count: mockUsers.filter((u) => u.role === "superadmin").length, color: "text-violet-600", bg: "bg-violet-50" },
                { label: "Admins",       count: mockUsers.filter((u) => u.role === "admin").length,      color: "text-brand-teal", bg: "bg-brand-teal/5" },
                { label: "Usuários",     count: mockUsers.filter((u) => u.role === "user").length,       color: "text-neutral-600", bg: "bg-neutral-50" },
                { label: "Revogados",    count: mockUsers.filter((u) => u.role === "revoked").length,    color: "text-red-500",     bg: "bg-red-50" },
              ] as const).map(({ label, count, color, bg }) => (
                <div key={label} className={cn("rounded-xl border border-neutral-100 p-4", bg)}>
                  <p className={cn("text-2xl font-bold", color)}>{count}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* User table */}
            <section className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                <Users size={15} className="text-neutral-400" />
                <h2 className="text-sm font-semibold text-brand-navy">Usuários registrados</h2>
                <span className="ml-auto text-xs text-neutral-400">
                  {mockUsers.filter((u) => u.role !== "revoked").length} ativos
                </span>
              </div>

              {mockUsers.length === 0 ? (
                <div className="py-12 text-center">
                  <Users size={28} className="mx-auto mb-3 text-neutral-200" />
                  <p className="text-sm text-neutral-400">Nenhum usuário registrado ainda</p>
                  <p className="text-xs text-neutral-300 mt-1">
                    Novos usuários aparecerão aqui após criarem conta em /register
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-50">
                  {mockUsers.map((u) => {
                    const isHardcoded = u.id === "superadmin-sonelio";
                    const isRevoked = u.role === "revoked";
                    const roleLabel: Record<MockUserRole, string> = {
                      superadmin: "Super Admin",
                      admin: "Admin",
                      user: "Usuário",
                      revoked: "Revogado",
                    };
                    const roleColor: Record<MockUserRole, string> = {
                      superadmin: "bg-violet-100 text-violet-700",
                      admin: "bg-brand-teal/10 text-brand-teal",
                      user: "bg-neutral-100 text-neutral-500",
                      revoked: "bg-red-100 text-red-600",
                    };

                    return (
                      <div
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3",
                          isRevoked && "opacity-50"
                        )}
                      >
                        {/* Avatar */}
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          isRevoked ? "bg-neutral-100 text-neutral-300" : "bg-brand-navy/10 text-brand-navy"
                        )}>
                          {u.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 truncate">{u.full_name}</p>
                          <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                        </div>

                        {/* Role badge + picker */}
                        {!isHardcoded && !isRevoked ? (
                          <div className="relative shrink-0" data-picker-container>
                            <button
                              onClick={() => setOpenPicker(openPicker === `mu-${u.id}` ? null : `mu-${u.id}`)}
                              className={cn(
                                "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
                                roleColor[u.role], "border-transparent hover:border-current/20"
                              )}
                            >
                              {roleLabel[u.role]}
                              <ChevronDown size={11} />
                            </button>
                            {openPicker === `mu-${u.id}` && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-20">
                                {(["user", "admin", "superadmin"] as MockUserRole[]).map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => handleMockUserRole(u.id, r)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 transition-colors"
                                  >
                                    <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", roleColor[r])}>
                                      {roleLabel[r]}
                                    </span>
                                    {u.role === r && <Check size={11} className="ml-auto text-brand-teal" />}
                                  </button>
                                ))}
                                <div className="border-t border-neutral-100 mt-1 pt-1">
                                  <button
                                    onClick={() => { setConfirmRevoke(u.id); setOpenPicker(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <Ban size={11} />
                                    Revogar acesso
                                  </button>
                                  <button
                                    onClick={() => { handleRemoveMockUser(u.id); setOpenPicker(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <UserX size={11} />
                                    Remover usuário
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : isRevoked ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn("text-xs font-medium px-2.5 py-1.5 rounded-lg", roleColor.revoked)}>
                              {roleLabel.revoked}
                            </span>
                            <button
                              onClick={() => handleMockUserRole(u.id, "user")}
                              className="text-xs text-neutral-400 hover:text-brand-teal transition-colors flex items-center gap-1"
                              title="Restaurar acesso como Usuário"
                            >
                              <ShieldCheck size={13} />
                              Restaurar
                            </button>
                            <button
                              onClick={() => handleRemoveMockUser(u.id)}
                              className="text-xs text-neutral-300 hover:text-red-500 transition-colors"
                              title="Remover permanentemente"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          // Hardcoded superadmin — read-only
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("text-xs font-medium px-2.5 py-1.5 rounded-lg", roleColor.superadmin)}>
                              {roleLabel.superadmin}
                            </span>
                            <ShieldOff size={12} className="text-neutral-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Revoke confirmation dialog */}
            {confirmRevoke && (() => {
              const u = mockUsers.find((x) => x.id === confirmRevoke);
              if (!u) return null;
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
                    <div className="flex items-center gap-2">
                      <Ban size={18} className="text-red-500" />
                      <p className="font-semibold text-neutral-800">Revogar acesso</p>
                    </div>
                    <p className="text-sm text-neutral-500">
                      <strong>{u.full_name}</strong> não conseguirá mais entrar na plataforma.
                      Você pode restaurar o acesso depois.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmRevoke(null)}
                        className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleRevokeMockUser(confirmRevoke)}
                        className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Revogar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <p className="text-xs text-neutral-400 text-center">
              Novos usuários são criados pela página{" "}
              <a href="/register" className="text-brand-teal hover:underline">/register</a>.
            </p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: Times                                                          */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "teams" && (
          <div className="space-y-5 pt-2">

            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-500">
                {isSuperAdmin
                  ? `${teams.length} ${teams.length === 1 ? "time" : "times"} na organização`
                  : "Seu time"}
              </p>
              {isSuperAdmin && !showNewTeam && (
                <button
                  onClick={() => setShowNewTeam(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-teal text-white text-sm font-medium rounded-lg hover:bg-brand-teal/90 transition-colors"
                >
                  <Plus size={14} />
                  Criar time
                </button>
              )}
            </div>

            {/* New team form */}
            {showNewTeam && (
              <div className="bg-white rounded-xl border border-brand-teal/30 p-5 space-y-4">
                <p className="text-sm font-semibold text-brand-navy">Novo time</p>
                <div className="flex gap-3">
                  <input
                    autoFocus
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createTeam(); if (e.key === "Escape") setShowNewTeam(false); }}
                    placeholder="Nome do time"
                    className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal"
                  />
                  <select
                    value={newTeamLeaderId}
                    onChange={(e) => setNewTeamLeaderId(e.target.value)}
                    className="text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-teal bg-white"
                  >
                    <option value="">Selecionar liderança</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowNewTeam(false); setNewTeamName(""); setNewTeamLeaderId(""); }}
                    className="px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createTeam}
                    disabled={!newTeamName.trim() || !newTeamLeaderId}
                    className="px-4 py-1.5 text-sm bg-brand-teal text-white rounded-lg disabled:opacity-40 hover:bg-brand-teal/90 transition-colors"
                  >
                    Criar
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {visibleTeams.length === 0 && (
              <div className="bg-white rounded-xl border border-neutral-100 p-12 text-center">
                <Users size={32} className="mx-auto mb-3 text-neutral-200" />
                <p className="text-sm text-neutral-400">Você não tem um time atribuído</p>
                <p className="text-xs text-neutral-300 mt-1">Peça ao Super Admin para criar um time com você como liderança</p>
              </div>
            )}

            {/* Team cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleTeams.map((team) => {
                const leader   = users.find((u) => u.id === team.leader_id);
                const members  = users.filter((u) => team.member_ids.includes(u.id));
                const nonMbrs  = users.filter((u) => !team.member_ids.includes(u.id));
                const canEdit  = isSuperAdmin || team.leader_id === currentUserId;

                return (
                  <div key={team.id} className="bg-white rounded-xl border border-neutral-100 overflow-visible">

                    {/* Card header */}
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-neutral-100 bg-neutral-50/60 rounded-t-xl">
                      {editingTeamId === team.id ? (
                        <input
                          autoFocus
                          value={editTeamNameValue}
                          onChange={(e) => setEditTeamNameValue(e.target.value)}
                          onBlur={() => saveTeamName(team.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTeamName(team.id);
                            if (e.key === "Escape") setEditingTeamId(null);
                          }}
                          className="flex-1 text-sm font-semibold text-brand-navy bg-transparent border-b border-brand-teal focus:outline-none pb-0.5"
                        />
                      ) : (
                        <h3
                          className={cn(
                            "flex-1 text-sm font-semibold text-brand-navy truncate",
                            isSuperAdmin && "cursor-pointer hover:text-brand-teal transition-colors"
                          )}
                          onClick={() => {
                            if (!isSuperAdmin) return;
                            setEditingTeamId(team.id);
                            setEditTeamNameValue(team.name);
                          }}
                          title={isSuperAdmin ? "Clique para renomear" : undefined}
                        >
                          {team.name}
                        </h3>
                      )}
                      <span className="text-[10px] text-neutral-400 bg-white border border-neutral-100 px-1.5 py-0.5 rounded-full shrink-0">
                        {members.length} {members.length === 1 ? "membro" : "membros"}
                      </span>
                      {isSuperAdmin && (
                        <button
                          onClick={() => deleteTeam(team.id)}
                          className="w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-destructive transition-colors rounded shrink-0"
                          title="Excluir time"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Leader row */}
                    <div className="px-4 py-2.5 border-b border-neutral-100/80">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 font-semibold">Liderança</p>
                      {leader ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-[9px] font-bold text-amber-700 shrink-0">
                            {getInitials(leader.name)}
                          </div>
                          <span className="text-xs font-medium text-neutral-700 flex-1 truncate">{leader.name}</span>
                          <Crown size={11} className="text-amber-400 shrink-0" />
                          {isSuperAdmin && (
                            <div className="relative shrink-0" data-picker-container>
                              <button
                                onClick={() => setOpenPicker(openPicker === `leader-${team.id}` ? null : `leader-${team.id}`)}
                                className="text-[10px] text-neutral-400 hover:text-brand-teal transition-colors ml-1"
                              >
                                Trocar
                              </button>
                              {openPicker === `leader-${team.id}` && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-30">
                                  {admins.map((a) => (
                                    <button
                                      key={a.id}
                                      onClick={() => changeLeader(team.id, a.id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 transition-colors"
                                    >
                                      <span className="w-5 h-5 rounded-full bg-brand-navy/10 flex items-center justify-center text-[8px] font-bold text-brand-navy shrink-0">
                                        {getInitials(a.name)}
                                      </span>
                                      <span className="flex-1 truncate">{a.name}</span>
                                      {a.id === team.leader_id && <Check size={10} className="text-brand-teal shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Sem liderança definida</span>
                      )}
                    </div>

                    {/* Members list */}
                    <div className="px-4 py-3">
                      <div className="flex items-center mb-2">
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold flex-1">Membros</p>
                        {canEdit && nonMbrs.length > 0 && (
                          <div className="relative" data-picker-container>
                            <button
                              onClick={() => setAddMemberTeamId(addMemberTeamId === team.id ? null : team.id)}
                              className="flex items-center gap-1 text-[10px] text-brand-teal hover:text-brand-teal/80 transition-colors font-medium"
                            >
                              <UserPlus size={11} />
                              Adicionar
                            </button>
                            {addMemberTeamId === team.id && (
                              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-30">
                                {nonMbrs.map((u) => (
                                  <button
                                    key={u.id}
                                    onClick={() => addMember(team.id, u.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 transition-colors"
                                  >
                                    <span className="w-5 h-5 rounded-full bg-brand-navy/10 flex items-center justify-center text-[8px] font-bold text-brand-navy shrink-0">
                                      {getInitials(u.name)}
                                    </span>
                                    <span className="flex-1 truncate">{u.name}</span>
                                    <span className={cn("text-[9px] px-1 py-0.5 rounded shrink-0", ROLE_COLORS[u.role])}>
                                      {ROLE_LABELS[u.role]}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {members.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic">Nenhum membro adicionado</p>
                      ) : (
                        <div className="space-y-1.5">
                          {members.map((u) => {
                            const isLeader = u.id === team.leader_id;
                            return (
                              <div key={u.id} className="flex items-center gap-2 py-0.5 group">
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                                  isLeader ? "bg-amber-100 text-amber-700" : "bg-brand-navy/10 text-brand-navy"
                                )}>
                                  {getInitials(u.name)}
                                </div>
                                <span className="text-xs text-neutral-700 flex-1 truncate">{u.name}</span>
                                <span className={cn("text-[9px] px-1 py-0.5 rounded shrink-0", ROLE_COLORS[u.role])}>
                                  {ROLE_LABELS[u.role]}
                                </span>
                                {/* h/sem field */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {canEdit ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={80}
                                      step={1}
                                      value={liquidTimeMap[u.id] ?? ""}
                                      placeholder="0"
                                      onChange={(e) => setLiquidTimeMap((prev) => ({ ...prev, [u.id]: parseFloat(e.target.value) || 0 }))}
                                      onBlur={(e) => saveLiquidHours(u.id, e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                      className="w-10 text-[10px] text-center border border-neutral-200 rounded px-1 py-0.5 focus:outline-none focus:border-brand-teal bg-white text-neutral-600"
                                      title="Horas líquidas por semana"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-neutral-400">{liquidTimeMap[u.id] ?? 0}</span>
                                  )}
                                  <span className="text-[9px] text-neutral-300">h/sem</span>
                                </div>
                                {isLeader
                                  ? <Crown size={10} className="text-amber-400 shrink-0" />
                                  : canEdit && (
                                    <button
                                      onClick={() => removeMember(team.id, u.id)}
                                      className="w-4 h-4 flex items-center justify-center text-neutral-200 hover:text-destructive transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                                      title="Remover do time"
                                    >
                                      <X size={10} />
                                    </button>
                                  )
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
