"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Users, LayoutGrid, ChevronDown, Check, Lock,
  Plus, Trash2, Crown, X, UserPlus, Ban, UserX,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/features/auth/hooks/useRole";
import { useAuthStore } from "@/features/auth/store/authStore";
import {
  type AppRole,
  ROLE_LABELS,
  ROLE_COLORS,
} from "@/lib/roles";

// ── Supabase user shape ─────────────────────────────────────────────────────────
interface SupabaseOrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string; // "owner" | "admin" | "member" | "viewer"
  joined_at: string;
}

const SB_ROLE_LABEL: Record<string, string> = {
  owner: "Super Admin",
  admin: "Admin",
  member: "Usuário",
  viewer: "Visitante",
};

const SB_ROLE_COLOR: Record<string, string> = {
  owner:  "bg-violet-100 text-violet-700",
  admin:  "bg-brand-teal/10 text-brand-teal",
  member: "bg-neutral-100 text-neutral-500",
  viewer: "bg-neutral-100 text-neutral-400",
};

// ── Types ──────────────────────────────────────────────────────────────────────

const TEAMS_KEY = "mwr_teams";

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
  return [];
}
function saveTeams(t: MockTeam[]) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(t));
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { isSuperAdmin, isAdmin } = useRole();
  const currentUserId = useAuthStore((s) => s.profile?.id ?? "");

  const [teams, setTeams] = useState<MockTeam[]>(() =>
    typeof window !== "undefined" ? loadTeams() : []
  );
  const [boards] = useState<{ id: string; name: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mwr_projects") ?? "[]"); } catch { return []; }
  });

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  // ── Supabase mode: users loaded from API ──────────────────────────────────────
  const [sbUsers, setSbUsers] = useState<SupabaseOrgUser[]>([]);
  const [sbUsersLoading, setSbUsersLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadSbUsers = useCallback(async () => {
    setSbUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setSbUsers(await res.json());
    } finally {
      setSbUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSbUsers();
  }, [loadSbUsers]);

  async function handleSbRoleChange(userId: string, role: string) {
    setActionLoading(userId);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setOpenPicker(null);
    setActionLoading(null);
    await loadSbUsers();
  }

  async function handleSbRemoveUser(userId: string) {
    setActionLoading(userId);
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    setConfirmRemove(null);
    setActionLoading(null);
    await loadSbUsers();
  }

  // Teams state
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLeaderId, setNewTeamLeaderId] = useState("");
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamNameValue, setEditTeamNameValue] = useState("");

  const authLoading = useAuthStore((s) => s.isLoading);

  // Redirect non-admins (wait for auth to load first)
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/boards");
  }, [authLoading, isAdmin, router]);

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

  if (authLoading) return null;
  if (!isAdmin) return null;

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

  // ── Derived (use sbUsers for overview stats)
  const activeUsers = sbUsers;
  const admins = sbUsers
    .filter((u) => u.role === "admin" || u.role === "owner")
    .map((u) => ({ id: u.id, name: u.full_name }));
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
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-neutral-200 -mb-2">
          {([
            { id: "overview" as AdminTab, label: "Visão Geral" },
            { id: "users"    as AdminTab, label: "Usuários", superadminOnly: true },
            { id: "teams"    as AdminTab, label: "Times" },
          ]).filter((t) => !t.superadminOnly || isSuperAdmin).map((tab) => (
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

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: Visão Geral                                                    */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-8 pt-2">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {([
                { label: "Super Admins", count: sbUsers.filter((u) => u.role === "owner").length,  color: "text-violet-600",  bg: "bg-violet-50" },
                { label: "Admins",       count: sbUsers.filter((u) => u.role === "admin").length,   color: "text-brand-teal", bg: "bg-brand-teal/5" },
                { label: "Usuários",     count: sbUsers.filter((u) => u.role === "member" || u.role === "viewer").length, color: "text-neutral-600", bg: "bg-neutral-50" },
              ]).map(({ label, count, color, bg }) => (
                <div key={label} className={cn("rounded-xl border border-neutral-100 p-4", bg)}>
                  <p className={cn("text-2xl font-bold", color)}>{count}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Members table */}
            <section className="bg-white rounded-xl border border-neutral-100">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                <Users size={15} className="text-neutral-400" />
                <h2 className="text-sm font-semibold text-brand-navy">Membros da organização</h2>
                <span className="ml-auto text-xs text-neutral-400">{activeUsers.length} membros</span>
              </div>
              <div className="divide-y divide-neutral-50">
                {activeUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center text-[11px] font-bold text-brand-navy shrink-0">
                      {getInitials(u.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{u.full_name}</p>
                      <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2.5 py-1 rounded-lg shrink-0",
                      SB_ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-500"
                    )}>
                      {SB_ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Boards */}
            {boards.length > 0 && (
              <section className="bg-white rounded-xl border border-neutral-100">
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
            <section className="bg-white rounded-xl border border-neutral-100">
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

            <>
                {/* Stats */}
                {!sbUsersLoading && (
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { label: "Super Admins", count: sbUsers.filter((u) => u.role === "owner").length,  color: "text-violet-600", bg: "bg-violet-50" },
                      { label: "Admins",       count: sbUsers.filter((u) => u.role === "admin").length,  color: "text-brand-teal", bg: "bg-brand-teal/5" },
                      { label: "Usuários",     count: sbUsers.filter((u) => u.role === "member" || u.role === "viewer").length, color: "text-neutral-600", bg: "bg-neutral-50" },
                    ]).map(({ label, count, color, bg }) => (
                      <div key={label} className={cn("rounded-xl border border-neutral-100 p-4", bg)}>
                        <p className={cn("text-2xl font-bold", color)}>{count}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                <section className="bg-white rounded-xl border border-neutral-100">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100">
                    <Users size={15} className="text-neutral-400" />
                    <h2 className="text-sm font-semibold text-brand-navy">Usuários registrados</h2>
                    <span className="ml-auto text-xs text-neutral-400">{sbUsers.length} membros</span>
                  </div>

                  {sbUsersLoading ? (
                    <div className="py-12 flex justify-center">
                      <Loader2 size={22} className="animate-spin text-neutral-300" />
                    </div>
                  ) : sbUsers.length === 0 ? (
                    <div className="py-12 text-center">
                      <Users size={28} className="mx-auto mb-3 text-neutral-200" />
                      <p className="text-sm text-neutral-400">Nenhum usuário ainda</p>
                      <p className="text-xs text-neutral-300 mt-1">Usuários aparecem aqui após criar conta e confirmar o email</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-50">
                      {sbUsers.map((u) => {
                        const isCurrentUser = u.id === currentUserId;
                        const isLoading = actionLoading === u.id;
                        return (
                          <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full bg-brand-navy/10 flex items-center justify-center text-xs font-bold text-brand-navy shrink-0">
                              {u.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-800 truncate">{u.full_name}</p>
                              <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                            </div>
                            {/* Loading spinner */}
                            {isLoading && <Loader2 size={14} className="animate-spin text-neutral-300 shrink-0" />}
                            {/* Role picker */}
                            {!isCurrentUser && !isLoading && (
                              <div className="relative shrink-0" data-picker-container>
                                <button
                                  onClick={() => setOpenPicker(openPicker === `sb-${u.id}` ? null : `sb-${u.id}`)}
                                  className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border-transparent border transition-colors", SB_ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-500")}
                                >
                                  {SB_ROLE_LABEL[u.role] ?? u.role}
                                  <ChevronDown size={11} />
                                </button>
                                {openPicker === `sb-${u.id}` && (
                                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-20">
                                    {(["member", "admin", "owner"] as const).map((r) => (
                                      <button
                                        key={r}
                                        onClick={() => handleSbRoleChange(u.id, r)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 transition-colors"
                                      >
                                        <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", SB_ROLE_COLOR[r])}>
                                          {SB_ROLE_LABEL[r]}
                                        </span>
                                        {u.role === r && <Check size={11} className="ml-auto text-brand-teal" />}
                                      </button>
                                    ))}
                                    <div className="border-t border-neutral-100 mt-1 pt-1">
                                      <button
                                        onClick={() => { setConfirmRemove(u.id); setOpenPicker(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        <UserX size={11} />
                                        Remover acesso
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Current user: read-only badge */}
                            {isCurrentUser && (
                              <span className={cn("text-xs font-medium px-2.5 py-1.5 rounded-lg shrink-0", SB_ROLE_COLOR[u.role])}>
                                {SB_ROLE_LABEL[u.role]} (você)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Remove confirmation */}
                {confirmRemove && (() => {
                  const u = sbUsers.find((x) => x.id === confirmRemove);
                  if (!u) return null;
                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
                        <div className="flex items-center gap-2">
                          <Ban size={18} className="text-red-500" />
                          <p className="font-semibold text-neutral-800">Remover acesso</p>
                        </div>
                        <p className="text-sm text-neutral-500">
                          <strong>{u.full_name}</strong> perderá o acesso à organização.
                          A conta do usuário não será excluída.
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">Cancelar</button>
                          <button onClick={() => handleSbRemoveUser(confirmRemove)} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">Remover</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-xs text-neutral-400 text-center">
                  Novos usuários criam conta em{" "}
                  <a href="/register" className="text-brand-teal hover:underline">/register</a>{" "}
                  e precisam confirmar o email para aparecer aqui.
                </p>
            </>
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
                const leader   = activeUsers.find((u) => u.id === team.leader_id);
                const members  = activeUsers.filter((u) => team.member_ids.includes(u.id));
                const nonMbrs  = activeUsers.filter((u) => !team.member_ids.includes(u.id));
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
                            {getInitials(leader.full_name)}
                          </div>
                          <span className="text-xs font-medium text-neutral-700 flex-1 truncate">{leader.full_name}</span>
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
                                      {getInitials(u.full_name)}
                                    </span>
                                    <span className="flex-1 truncate">{u.full_name}</span>
                                    <span className={cn("text-[9px] px-1 py-0.5 rounded shrink-0", SB_ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-500")}>
                                      {SB_ROLE_LABEL[u.role] ?? u.role}
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
                                  {getInitials(u.full_name)}
                                </div>
                                <span className="text-xs text-neutral-700 flex-1 truncate">{u.full_name}</span>
                                <span className={cn("text-[9px] px-1 py-0.5 rounded shrink-0", SB_ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-500")}>
                                  {SB_ROLE_LABEL[u.role] ?? u.role}
                                </span>
                                {/* placeholder so the column doesn't collapse */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {canEdit ? (
                                    <span className="text-[10px] text-neutral-300">—</span>
                                  ) : (
                                    <span className="text-[10px] text-neutral-400">—</span>
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
