"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  User,
  Search,
  HelpCircle,
  Bell,
  ChevronDown,
  Plus,
  ChevronRight,
  FolderKanban,
  ListTodo,
  BarChart2,
  FileText,
  Zap,
  X,
  Loader2,
  Square,
  Clock,
  ListTodo as TaskIcon,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSignOut } from "@/features/auth/hooks/useAuth";
import { useRole } from "@/features/auth/hooks/useRole";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { formatElapsed } from "@/types";
import type { AppNotification } from "@/features/notifications/store/notificationStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

const EMPRESA_ITEMS = [
  { href: "/company/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/company/projects", label: "Projetos", icon: FolderKanban },
  { href: "/company/tasks", label: "Tarefas", icon: ListTodo },
  { href: "/company/forms", label: "Formulários", icon: FileText },
  { href: "/automations", label: "Automações", icon: Zap, badge: "NOVO" },
];

const TOP_LINKS = [
  { href: "/boards", label: "Quadros", icon: LayoutGrid },
  { href: "/me", label: "Eu", icon: User },
];

/** Pulsing pill in the nav that shows when a timer is running */
function GlobalTimerPill() {
  const { isRunning, elapsed, activeTaskId, stopTimer } = useTimerStore();
  const { user } = useAuthStore();

  if (!isRunning || !activeTaskId) return null;

  return (
    <button
      onClick={() => user?.id && stopTimer(user.id)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-teal text-white text-xs font-mono font-semibold hover:opacity-90 transition-all shrink-0"
      title="Clique para parar o timer"
    >
      <Square size={10} />
      {formatElapsed(elapsed)}
    </button>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuthStore();
  const signOut = useSignOut();
  const { role, isSuperAdmin, isAdmin, can } = useRole();
  const { unreadCount, notifications, markAllRead, markRead } = useNotificationStore();
  const hasUnreadOverflow = notifications.some((n) => n.type === "capacity_overflow" && !n.read_at);

  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const empresaRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const newTaskRef = useRef<HTMLDivElement>(null);

  // Debounce search (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Categorized global search over mock localStorage data
  const searchResults = computeGlobalSearch(debounced);
  const recentViews = historyOpen ? readRecentViews() : [];

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (empresaRef.current && !empresaRef.current.contains(e.target as Node)) {
        setEmpresaOpen(false);
      }
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
      if (newTaskRef.current && !newTaskRef.current.contains(e.target as Node)) {
        setNewTaskOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="h-12 shrink-0 flex items-center gap-1 px-3 bg-brand-navy border-b border-brand-navy-light/30 z-40">
      {/* Logo */}
      <Link
        href="/boards"
        className="flex items-center gap-1.5 mr-3 shrink-0"
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white text-xs" style={{ background: "#01CFB5" }}>
          M
        </div>
        <span className="font-bold text-white text-sm hidden sm:block" style={{ fontFamily: "var(--font-montserrat)" }}>
          medwayrun
        </span>
      </Link>

      {/* Primary nav links */}
      <nav className="flex items-center gap-0.5">
        {TOP_LINKS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              {label}
            </Link>
          );
        })}

        {/* Empresa dropdown — visible to all roles; Painel Admin inside is guarded separately */}
        {can("view_company") && (
          <div ref={empresaRef} className="relative">
            <button
              onClick={() => setEmpresaOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname.startsWith("/company") || pathname.startsWith("/automations")
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              Empresa
              <ChevronDown size={12} className={cn("transition-transform", empresaOpen && "rotate-180")} />
            </button>

            {empresaOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-50">
                {EMPRESA_ITEMS.map(({ href, label, icon: Icon, badge }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setEmpresaOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-brand-navy transition-colors"
                  >
                    <Icon size={14} className="text-neutral-400 shrink-0" />
                    {label}
                    {badge && (
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal">
                        {badge}
                      </span>
                    )}
                  </Link>
                ))}
                {isAdmin && (
                  <>
                    <div className="my-1 border-t border-neutral-100" />
                    <Link
                      href="/admin"
                      onClick={() => setEmpresaOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      <Shield size={14} className="text-violet-500 shrink-0" />
                      Painel Admin
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
                        {isSuperAdmin ? "SA" : "ADM"}
                      </span>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative mr-1">
        {searchOpen ? (
          <>
            <div className="flex items-center gap-1 bg-white/15 rounded-lg px-2 py-1">
              <Search size={13} className="text-white/60 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarefas, projetos, quadros..."
                className="bg-transparent text-white text-xs placeholder:text-white/40 outline-none w-52"
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
                  if (e.key === "Enter" && searchQuery.trim()) { router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`); setSearchOpen(false); }
                }}
              />
              <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }}>
                <X size={11} className="text-white/60" />
              </button>
            </div>
            {debounced.trim() && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden max-h-96 overflow-y-auto">
                {searchResults.total === 0 ? (
                  <p className="text-xs text-neutral-400 px-4 py-5 text-center">Nenhum resultado para “{debounced}”.</p>
                ) : (
                  <>
                    <SearchGroup title="Tarefas" items={searchResults.tasks} onPick={(id) => { router.push(`/tasks/${id}`); setSearchOpen(false); setSearchQuery(""); }} />
                    <SearchGroup title="Projetos" items={searchResults.projects} onPick={(id) => { router.push(`/boards/${id}`); setSearchOpen(false); setSearchQuery(""); }} />
                    <SearchGroup title="Quadros" items={searchResults.boards} onPick={(id) => { router.push(`/boards/${id}`); setSearchOpen(false); setSearchQuery(""); }} />
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Search size={14} />
          </button>
        )}
      </div>

      {/* History (recent task views) */}
      <div ref={historyRef} className="relative">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          title="Visitadas recentemente"
        >
          <Clock size={14} />
        </button>
        {historyOpen && (
          <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-neutral-100">
              <span className="text-sm font-semibold text-brand-navy">Visitadas recentemente</span>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {recentViews.length === 0 ? (
                <p className="text-xs text-neutral-400 px-4 py-5 text-center">Nenhuma tarefa visitada ainda.</p>
              ) : recentViews.map((r) => (
                <button key={r.id} onClick={() => { router.push(`/tasks/${r.id}`); setHistoryOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-neutral-50 transition-colors">
                  <p className="text-sm text-brand-navy truncate">{r.title}</p>
                  <p className="text-[10px] text-neutral-400">{r.board} · {timeAgoShort(r.viewed_at)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active timer pill */}
      <GlobalTimerPill />

      {/* Help */}
      <button className="w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
        <HelpCircle size={14} />
      </button>

      {/* Notifications */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="relative w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none ${hasUnreadOverflow ? "bg-amber-500" : "bg-destructive"}`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden">
            {/* Notif header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-sm font-semibold text-brand-navy">Notificações</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-teal hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>
            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Bell size={20} className="text-neutral-200" />
                  <p className="text-sm text-neutral-400">Sem notificações</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <NotifItem
                    key={n.id}
                    notification={n}
                    onRead={() => {
                      markRead(n.id);
                      if (n.task_id && (n.type === "capacity_overflow" || n.type === "approval_requested")) {
                        setNotifOpen(false);
                        router.push(`/tasks/${n.task_id}`);
                      }
                    }}
                  />
                ))
              )}
            </div>
            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-neutral-100 text-center">
                <button className="text-xs text-brand-teal hover:underline">
                  Ver todas as notificações
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar dropdown */}
      <div ref={avatarRef} className="relative ml-1">
        <button
          onClick={() => setAvatarOpen((v) => !v)}
          className="outline-none rounded-full ring-2 ring-transparent hover:ring-brand-teal transition-all"
        >
          <Avatar className="w-7 h-7 cursor-pointer">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-brand-teal text-white text-xs font-semibold">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
        </button>

        {avatarOpen && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-50">
            <div className="px-3 py-2 border-b border-neutral-50">
              <p className="text-sm font-medium text-brand-navy truncate">
                {profile?.full_name ?? "Usuário"}
              </p>
              <p className="text-xs text-neutral-400">Medway</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setAvatarOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Configurações
            </Link>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Nova tarefa CTA + dropdown */}
      <div ref={newTaskRef} className="relative ml-2 shrink-0 flex items-stretch">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-create-task"))}
          className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-l-lg text-sm font-semibold bg-brand-teal hover:bg-brand-teal-dark text-white transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Nova tarefa</span>
        </button>
        <button
          onClick={() => setNewTaskOpen((v) => !v)}
          className="flex items-center px-1.5 rounded-r-lg bg-brand-teal hover:bg-brand-teal-dark text-white border-l border-white/20 transition-colors"
        >
          <ChevronDown size={13} className={cn("transition-transform", newTaskOpen && "rotate-180")} />
        </button>
        {newTaskOpen && (
          <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-50">
            <button onClick={() => { setNewTaskOpen(false); window.dispatchEvent(new CustomEvent("open-create-task")); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 text-left">
              <TaskIcon size={14} className="text-neutral-400" /> Nova tarefa
            </button>
            <button onClick={() => { setNewTaskOpen(false); window.dispatchEvent(new CustomEvent("open-create-task", { detail: { blank: true } })); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 text-left">
              <Plus size={14} className="text-neutral-400" /> Nova tarefa do zero
            </button>
            <div className="h-px bg-neutral-100 my-1" />
            <button onClick={() => { setNewTaskOpen(false); router.push("/boards"); window.dispatchEvent(new CustomEvent("open-create-project")); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 text-left">
              <FolderKanban size={14} className="text-neutral-400" /> Novo projeto
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Global search + recent views helpers ──────────────────────────────────────

interface SearchHit { id: string; label: string; sub?: string; }
function computeGlobalSearch(q: string): { tasks: SearchHit[]; projects: SearchHit[]; boards: SearchHit[]; total: number } {
  const empty = { tasks: [], projects: [], boards: [], total: 0 };
  if (!q.trim() || typeof window === "undefined") return empty;
  const ql = q.toLowerCase();
  let tasks: SearchHit[] = [], projects: SearchHit[] = [];
  try {
    const t = JSON.parse(localStorage.getItem("mwr_tasks") ?? "[]");
    tasks = t.filter((x: any) => x.title?.toLowerCase().includes(ql)).slice(0, 5).map((x: any) => ({ id: x.id, label: x.title }));
  } catch {}
  try {
    const p = JSON.parse(localStorage.getItem("mwr_projects") ?? "[]");
    projects = p.filter((x: any) => x.name?.toLowerCase().includes(ql)).slice(0, 5).map((x: any) => ({ id: x.id, label: x.name }));
  } catch {}
  // Boards = same as projects in this app; show as a separate category
  const boards = projects;
  return { tasks, projects, boards, total: tasks.length + projects.length + boards.length };
}

interface RecentView { id: string; title: string; board: string; viewed_at: string; }
function readRecentViews(): RecentView[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("mwr_recent_views") ?? "[]"); } catch { return []; }
}
function timeAgoShort(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora"; if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  } catch { return ""; }
}

function SearchGroup({ title, items, onPick }: { title: string; items: SearchHit[]; onPick: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it.id)} className="w-full text-left px-4 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 truncate">
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── NotifItem ────────────────────────────────────────────────────────────────

const NOTIF_ICONS: Record<AppNotification["type"], string> = {
  mention: "💬",
  task_assigned: "👤",
  task_delivered: "✅",
  comment: "🗨️",
  approval_requested: "🛡️",
  approval_resolved: "⚖️",
  capacity_overflow: "⚡",
};

function NotifItem({
  notification: n,
  onRead,
}: {
  notification: AppNotification;
  onRead: () => void;
}) {
  const isUnread = !n.read_at;
  const isOverflow = n.type === "capacity_overflow";
  return (
    <button
      onClick={onRead}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
        isUnread
          ? isOverflow ? "bg-amber-50 hover:bg-amber-100/60" : "bg-brand-teal/5 hover:bg-brand-teal/10"
          : "hover:bg-neutral-50"
      )}
    >
      <span className="text-base shrink-0 mt-0.5">{NOTIF_ICONS[n.type]}</span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm line-clamp-2", isUnread ? "font-medium text-neutral-800" : "text-neutral-600")}>
          {n.content}
        </p>
        <p className="text-xs text-neutral-400 mt-0.5">
          {new Date(n.created_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      {isUnread && (
        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${isOverflow ? "bg-amber-400" : "bg-brand-teal"}`} />
      )}
    </button>
  );
}
