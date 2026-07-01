"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckSquare, Edit3, Eye, Clock, ChevronLeft, ChevronRight, CalendarDays,
  SlidersHorizontal, CheckCircle2, Play, Square, Flag, Plus, Download,
  MessageSquare, ListChecks, GitBranch, Paperclip, Tag as TagIcon, Settings2, X,
} from "lucide-react";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { IS_MOCK, mockTasks, mockTimeEntries, mockLiquidTime } from "@/lib/mockDb";
import { getMondayOfWeek, recordDeliveryHistory } from "@/lib/liquidTime";
import { PRIORITY_COLORS, PRIORITY_LABELS, formatElapsed } from "@/types";
import type { MockTask } from "@/lib/mockDb";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { MyApprovals } from "@/features/tasks/components/ApprovalControls";

const TABS = [
  { id: "tasks", label: "Tarefas para mim", icon: CheckSquare },
  { id: "created", label: "Que criei", icon: Edit3 },
  { id: "following", label: "Que acompanho", icon: Eye },
  { id: "approvals", label: "Minhas aprovações", icon: CheckCircle2 },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "time", label: "Tempo", icon: Clock },
];

type SortBy = "due_date" | "priority" | "title" | "urgent";

export default function MePage() {
  const [activeTab, setActiveTab] = useState("tasks");
  const { profile, user } = useAuthStore();
  const [tasks, setTasks] = useState<MockTask[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Sort/filter state (shared between tasks and created tabs)
  const [sortBy, setSortBy] = useState<SortBy>("due_date");
  const [filterProject, setFilterProject] = useState<string>("");
  const [showDelivered, setShowDelivered] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"open" | "delivered" | "all">("open");

  const projects = useProjectStore((s) => s.projects);

  const reloadTasks = useCallback(() => {
    if (!IS_MOCK) return;
    try {
      const raw = localStorage.getItem("mwr_tasks");
      const all = raw ? (JSON.parse(raw) as MockTask[]) : [];
      setTasks(all.filter((t) => t.status !== "archived"));
    } catch { setTasks([]); }
  }, []);

  useEffect(() => { reloadTasks(); }, [reloadTasks]);

  const userId = user?.id ?? "mock-user";

  const myTasks = IS_MOCK
    ? tasks
    : tasks.filter((t) => t.assignee_id === userId);

  const createdByMe = IS_MOCK
    ? tasks
    : tasks.filter((t) => t.created_by === userId);

  function applySortAndFilter(tasksToShow: MockTask[]): MockTask[] {
    // Filter by project
    let result = filterProject
      ? tasksToShow.filter((t) => t.project_id === filterProject)
      : tasksToShow;

    // Filter by status chips (tasks + created tabs) or legacy showDelivered checkbox
    if (activeTab === "tasks" || activeTab === "created") {
      if (filterStatus === "open") result = result.filter((t) => t.status !== "delivered");
      else if (filterStatus === "delivered") result = result.filter((t) => t.status === "delivered");
      // "all" — no filter
    } else {
      // Filter delivered
      result = showDelivered ? result : result.filter((t) => t.status !== "delivered");
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      if (sortBy === "due_date") return (a.due_date ?? "zzz").localeCompare(b.due_date ?? "zzz");
      if (sortBy === "priority") {
        const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      }
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "urgent") return (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
      return 0;
    });

    return sorted;
  }

  const showFilterBar = activeTab === "tasks" || activeTab === "created";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-neutral-100 bg-white shrink-0">
        <Avatar className="w-10 h-10">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-navy text-white font-semibold">
            {getInitials(profile?.full_name ?? "Você")}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-base font-semibold text-brand-navy">
            {profile?.full_name ?? "Minha área"}
          </h1>
          <p className="text-xs text-neutral-400">Medway · Demo</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-navy">{myTasks.filter(t => t.status !== "delivered").length}</p>
            <p className="text-[10px] text-neutral-400">tarefas abertas</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">{myTasks.filter(t => t.status === "delivered").length}</p>
            <p className="text-[10px] text-neutral-400">entregues</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-red-500">{myTasks.filter(t => isOverdue(t.due_date)).length}</p>
            <p className="text-[10px] text-neutral-400">atrasadas</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-neutral-100 bg-white shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeTab === id
                ? "bg-brand-navy/5 text-brand-navy"
                : "text-neutral-500 hover:text-brand-navy hover:bg-neutral-50"
            )}
          >
            <Icon size={13} />
            {label}
            {id === "tasks" && myTasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold">
                {myTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sort/filter toolbar */}
      {showFilterBar && (
        <div className="flex items-center gap-2 px-6 py-2 border-b border-neutral-100 bg-neutral-50/60 shrink-0 flex-wrap">
          <SlidersHorizontal size={13} className="text-neutral-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-brand-teal text-neutral-600"
          >
            <option value="due_date">Data de entrega</option>
            <option value="priority">Prioridade</option>
            <option value="title">Título</option>
            <option value="urgent">Urgência</option>
          </select>
          {projects.length > 0 && (
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-brand-teal text-neutral-600"
            >
              <option value="">Todos os projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {(activeTab === "tasks" || activeTab === "created") ? (
            <div className="flex gap-1">
              {(["open", "delivered", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                    filterStatus === s
                      ? "bg-brand-navy text-white"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  )}
                >
                  {s === "open" ? "Abertas" : s === "delivered" ? "Entregues" : "Todas"}
                </button>
              ))}
            </div>
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={showDelivered}
                onChange={(e) => setShowDelivered(e.target.checked)}
                className="rounded border-neutral-300 accent-brand-teal"
              />
              Mostrar entregues
            </label>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "tasks" && (
          <TaskList
            tasks={applySortAndFilter(myTasks)}
            emptyText="Nenhuma tarefa alocada para você."
            showDelivered={filterStatus !== "open"}
            onOpen={setOpenTaskId}
            onChanged={reloadTasks}
          />
        )}
        {activeTab === "created" && (
          <TaskList
            tasks={applySortAndFilter(createdByMe)}
            emptyText="Você ainda não criou nenhuma tarefa."
            showDelivered={filterStatus !== "open"}
            onOpen={setOpenTaskId}
            onChanged={reloadTasks}
          />
        )}
        {activeTab === "following" && (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Eye size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Nenhuma tarefa sendo acompanhada.</p>
          </div>
        )}
        {activeTab === "approvals" && <MyApprovals onOpenTask={setOpenTaskId} />}
        {activeTab === "calendar" && <MiniCalendar tasks={myTasks} />}
        {activeTab === "time" && (
          <>
            {IS_MOCK && <LiquidTimeSummary />}
            <Timesheet />
          </>
        )}
      </div>

      {openTaskId && (
        <TaskDetail
          taskId={openTaskId}
          onClose={() => { setOpenTaskId(null); reloadTasks(); }}
        />
      )}
    </div>
  );
}

function TaskList({
  tasks,
  emptyText,
  showDelivered,
  onOpen,
  onChanged,
}: {
  tasks: MockTask[];
  emptyText: string;
  showDelivered?: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
        <CheckSquare size={32} className="mb-2 opacity-30" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  // Since filtering is already applied upstream, just render the list grouped by status
  const open = tasks.filter(t => t.status !== "delivered");
  const done = tasks.filter(t => t.status === "delivered");

  return (
    <div className="space-y-6 max-w-2xl">
      {open.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Em aberto · {open.length}
          </p>
          <div className="space-y-2">
            {open.map(t => <TaskRow key={t.id} task={t} onOpen={onOpen} onChanged={onChanged} />)}
          </div>
        </div>
      )}
      {showDelivered && done.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            Entregues · {done.length}
          </p>
          <div className="space-y-2 opacity-60">
            {done.map(t => <TaskRow key={t.id} task={t} onOpen={onOpen} onChanged={onChanged} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task: taskProp, onOpen, onChanged }: { task: MockTask; onOpen: (id: string) => void; onChanged: () => void }) {
  const [task, setTaskState] = useState(taskProp);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const { user } = useAuthStore();
  const userId = user?.id ?? "mock-user";
  const projects = useProjectStore((s) => s.projects);
  const proj = task.project_id ? projects.find((p) => p.id === task.project_id) : null;

  const activeTaskId = useTimerStore((s) => s.activeTaskId);
  const elapsed = useTimerStore((s) => s.elapsed);
  const startTimer = useTimerStore((s) => s.startTimer);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const isActive = activeTaskId === task.id;

  useEffect(() => { setTaskState(taskProp); }, [taskProp]);

  const overdue = isOverdue(task.due_date);
  const isDelivered = task.status === "delivered";
  const est = task.estimated_hours ?? 0;
  const tracked = task.tracked_hours ?? 0;
  const ratio = est > 0 ? Math.min(tracked / est, 1) : 0;
  const ratioColor = ratio < 0.7 ? "#01CFB5" : ratio < 1 ? "#FFB81C" : "#AC145A";

  function patch(updates: Partial<MockTask>) {
    if (IS_MOCK) {
      if (updates.status === "delivered") recordDeliveryHistory(task, task.project_id);
      mockTasks.update(task.id, updates);
    }
    setTaskState((t) => ({ ...t, ...updates }));
    onChanged();
  }

  async function toggleTimer(e: React.MouseEvent) {
    e.stopPropagation();
    if (isActive) {
      await stopTimer(userId);
      const fresh = IS_MOCK ? mockTasks.get(task.id) : null;
      if (fresh) setTaskState(fresh);
      onChanged();
    } else {
      await startTimer(userId, task.id);
    }
  }

  function saveManual(minutes: number, date: string) {
    if (IS_MOCK) {
      mockTimeEntries.add(userId, task.id, minutes, date, "Manual");
      mockTasks.update(task.id, { tracked_hours: tracked + minutes / 60 });
    }
    setTaskState((t) => ({ ...t, tracked_hours: tracked + minutes / 60 }));
    setAdjustOpen(false);
    onChanged();
  }

  const QUICK_ACTIONS = [
    { icon: MessageSquare, title: "Comentar" },
    { icon: ListChecks, title: "Checklist" },
    { icon: GitBranch, title: "Subtarefas" },
    { icon: Paperclip, title: "Anexar" },
    { icon: TagIcon, title: "Tags" },
  ];

  return (
    <>
      <div
        onClick={() => onOpen(task.id)}
        className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 hover:border-brand-teal/30 hover:shadow-sm transition-all group cursor-pointer"
      >
        <div className="w-1 h-9 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[task.priority] ?? "#ccc" }} />

        {/* Timer */}
        <button
          onClick={toggleTimer}
          title={isActive ? "Pausar cronômetro" : "Iniciar cronômetro"}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
            isActive ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-400 hover:bg-brand-teal/10 hover:text-brand-teal"
          )}
        >
          {isActive ? <Square size={12} /> : <Play size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className={cn("text-sm font-medium text-brand-navy truncate", isDelivered && "line-through text-neutral-400")}>
              {task.title}
            </p>
            {proj && (
              <span className="flex items-center gap-1 shrink-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: (proj as { color?: string }).color ?? "#00205B" }} />
                <span className="text-[10px] text-neutral-400 truncate max-w-[100px]">{proj.name}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-neutral-400">{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
            {task.due_date && (
              <span className={cn("text-[10px]", overdue ? "text-red-500 font-medium" : "text-neutral-400")}>
                {overdue ? "⚠ Atrasada · " : "Prazo: "}{formatDate(task.due_date)}
              </span>
            )}
            {isActive ? (
              <span className="text-[10px] font-mono text-brand-teal font-semibold">{formatElapsed(elapsed)}</span>
            ) : tracked > 0 ? (
              <span className="text-[10px] text-neutral-400">{Math.floor(tracked)}h{Math.round((tracked % 1) * 60)}m</span>
            ) : null}
          </div>
          {/* Progress bar + Ajustes */}
          {est > 0 ? (
            <div className="mt-1.5 flex items-center gap-2 max-w-[300px]">
              <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: ratioColor }} />
              </div>
              <span className="text-[10px] text-neutral-400 shrink-0">{Math.round(ratio * 100)}%</span>
              <button onClick={(e) => { e.stopPropagation(); setAdjustOpen(true); }} className="text-[10px] text-brand-teal hover:underline shrink-0">Ajustes</button>
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setAdjustOpen(true); }} className="mt-1 text-[10px] text-brand-teal hover:underline">Ajustes</button>
          )}
        </div>

        {/* Quick actions (hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
          {QUICK_ACTIONS.map(({ icon: Icon, title }) => (
            <button
              key={title}
              title={title}
              onClick={() => onOpen(task.id)}
              className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
            >
              <Icon size={12} />
            </button>
          ))}
          <button
            title="Ajustar tempo manualmente"
            onClick={() => setAdjustOpen(true)}
            className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
          >
            <Settings2 size={12} />
          </button>
        </div>

        {/* Flag */}
        <button
          onClick={(e) => { e.stopPropagation(); patch({ is_urgent: !task.is_urgent }); }}
          title="Marcar urgente"
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors",
            task.is_urgent ? "text-destructive bg-destructive/10" : "text-neutral-300 hover:text-destructive hover:bg-destructive/5"
          )}
        >
          <Flag size={13} fill={task.is_urgent ? "currentColor" : "none"} />
        </button>

        {/* Deliver */}
        <button
          onClick={(e) => { e.stopPropagation(); patch({ status: isDelivered ? "open" : "delivered" }); }}
          title={isDelivered ? "Reabrir" : "Entregar"}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors",
            isDelivered ? "text-green-600 bg-green-50" : "text-neutral-300 hover:text-green-600 hover:bg-green-50"
          )}
        >
          <CheckCircle2 size={14} />
        </button>
      </div>

      {adjustOpen && (
        <ManualTimeModal
          taskTitle={task.title}
          onClose={() => setAdjustOpen(false)}
          onSave={saveManual}
        />
      )}
    </>
  );
}

function ManualTimeModal({ taskTitle, onClose, onSave }: { taskTitle: string; onClose: () => void; onSave: (minutes: number, date: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"duration" | "range">("duration");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  function computeMinutes(): number {
    if (mode === "duration") return (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-brand-navy">Registrar tempo</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={15} /></button>
        </div>
        <p className="text-xs text-neutral-400 mb-4 truncate">{taskTitle}</p>

        <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 block mb-1">Data</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 w-full mb-3 outline-none focus:border-brand-teal" />

        <div className="flex gap-1 mb-3">
          {(["duration", "range"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("flex-1 text-xs py-1.5 rounded-md font-medium transition-colors", mode === m ? "bg-brand-navy text-white" : "bg-neutral-100 text-neutral-500")}>
              {m === "duration" ? "Duração" : "Início / Fim"}
            </button>
          ))}
        </div>

        {mode === "duration" ? (
          <div className="flex items-center gap-2 mb-4">
            <input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 w-full outline-none focus:border-brand-teal" />
            <span className="text-xs text-neutral-400">h</span>
            <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 w-full outline-none focus:border-brand-teal" />
            <span className="text-xs text-neutral-400">min</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-4">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 w-full outline-none focus:border-brand-teal" />
            <span className="text-xs text-neutral-400">→</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 w-full outline-none focus:border-brand-teal" />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-xs py-2 rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50">Cancelar</button>
          <button onClick={() => onSave(computeMinutes(), date)} disabled={computeMinutes() <= 0}
            className="flex-1 text-xs py-2 rounded-md bg-brand-teal text-white font-medium hover:opacity-90 disabled:opacity-40">
            Registrar {Math.floor(computeMinutes() / 60)}h{computeMinutes() % 60}m
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ tasks }: { tasks: MockTask[] }) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);

  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday-based grid: 0 = Mon, 6 = Sun
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null;
    return new Date(year, month, dayNum);
  });

  // Map tasks to due date strings "YYYY-MM-DD"
  const tasksByDate = tasks.reduce<Record<string, MockTask[]>>((acc, t) => {
    if (!t.due_date) return acc;
    const key = t.due_date.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const monthLabel = viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const DOW_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-brand-navy capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="text-xs px-2 py-1 rounded hover:bg-neutral-100 text-neutral-500"
          >
            Hoje
          </button>
          <button
            onClick={() => setMonthOffset(o => o + 1)}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-16 rounded-lg" />;
          const key = date.toISOString().slice(0, 10);
          const dayTasks = tasksByDate[key] ?? [];
          const isToday = date.toDateString() === today.toDateString();
          const isPast = date < today && !isToday;

          return (
            <div
              key={i}
              className={cn(
                "h-16 rounded-lg border p-1.5 flex flex-col overflow-hidden",
                isToday
                  ? "border-brand-teal bg-brand-teal/5"
                  : isPast
                  ? "border-neutral-100 bg-neutral-50/50"
                  : "border-neutral-100 bg-white"
              )}
            >
              <span className={cn(
                "text-[11px] font-semibold leading-none",
                isToday ? "text-brand-teal" : isPast ? "text-neutral-300" : "text-brand-navy"
              )}>
                {date.getDate()}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: PRIORITY_COLORS[t.priority] ?? "#ccc" }}
                      title={t.title}
                    />
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[8px] text-neutral-400 leading-none mt-0.5">+{dayTasks.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <p className="text-xs text-neutral-400 text-center">
          Os pontos indicam tarefas com prazo nesse dia. Passe o cursor para ver o título.
        </p>
      </div>
    </div>
  );
}

// ── LiquidTimeSummary ────────────────────────────────────────────────────────

function LiquidTimeSummary() {
  const { user } = useAuthStore();
  const userId = user?.id ?? "mock-user";
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const baseMondayStr = getMondayOfWeek(todayStr);
  const baseMondayDate = new Date(baseMondayStr + "T12:00:00Z");
  baseMondayDate.setUTCDate(baseMondayDate.getUTCDate() + weekOffset * 7);
  const weekStart = baseMondayDate.toISOString().slice(0, 10);

  const config = mockLiquidTime.get(userId);
  const liquidHours = config?.hours_per_week ?? 0;

  const weekTasks = mockTasks.listAll().filter((t) => {
    if (t.assignee_id !== userId) return false;
    if (!t.desired_start_date) return false;
    return getMondayOfWeek(t.desired_start_date) === weekStart;
  });

  const allocatedHours = weekTasks.reduce((sum, t) => {
    if (t.tracked_hours > 0) return sum + t.tracked_hours;
    return sum + (t.estimated_hours ?? 0);
  }, 0);

  const ratio = liquidHours > 0 ? allocatedHours / liquidHours : 0;
  const barColor = ratio < 0.7 ? "#01CFB5" : ratio < 1 ? "#FFB81C" : "#AC145A";

  const friday = new Date(baseMondayDate);
  friday.setUTCDate(baseMondayDate.getUTCDate() + 4);
  const weekLabel = `${baseMondayDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${friday.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-5 mb-5">
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm font-semibold text-brand-navy flex-1">Tempo líquido da semana</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 transition-colors">
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs text-neutral-500 w-36 text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {liquidHours === 0 ? (
        <p className="text-xs text-neutral-400 italic">Tempo líquido não configurado. Peça ao seu líder para definir no Painel Admin &gt; Times.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(ratio * 100, 100)}%`, background: barColor }}
              />
            </div>
            <span className="text-xs font-semibold text-neutral-700 shrink-0">
              {allocatedHours.toFixed(1)}h / {liquidHours}h
              {ratio > 1 && <span className="text-destructive ml-1">+{(allocatedHours - liquidHours).toFixed(1)}h</span>}
            </span>
          </div>
          {weekTasks.length > 0 ? (
            <div className="space-y-1.5">
              {weekTasks.map((t) => {
                const h = t.tracked_hours > 0 ? t.tracked_hours : (t.estimated_hours ?? 0);
                const src = t.tracked_hours > 0 ? "registrado" : "estimado";
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.capacity_pending ? "bg-amber-400" : "bg-neutral-300"}`} />
                    <span className="flex-1 truncate text-neutral-600">{t.title}</span>
                    <span className="text-neutral-400 shrink-0">{src}</span>
                    <span className="font-medium text-neutral-700 shrink-0 w-10 text-right">{h > 0 ? `${h.toFixed(1)}h` : "—"}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Nenhuma tarefa com início previsto nesta semana.</p>
          )}
        </>
      )}
    </div>
  );
}

const META_KEY = "mwr_timesheet_goal_mock-user";

function Timesheet() {
  const { user } = useAuthStore();
  const userId = user?.id ?? "mock-user";
  const [weekOffset, setWeekOffset] = useState(0);
  const [goal, setGoal] = useState(8);
  const [minutesByDate, setMinutesByDate] = useState<Record<string, number>>({});
  const [adjustDate, setAdjustDate] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (IS_MOCK) setMinutesByDate(mockTimeEntries.minutesByDate(userId));
  }, [userId]);

  useEffect(() => {
    reload();
    const g = parseFloat(localStorage.getItem(META_KEY) ?? "8");
    if (!isNaN(g)) setGoal(g);
  }, [reload]);

  function updateGoal(v: number) {
    setGoal(v);
    localStorage.setItem(META_KEY, String(v));
  }

  const today = new Date();
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(today.getDate() + mondayOffset + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  function dateKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function hoursFor(d: Date) { return (minutesByDate[dateKey(d)] ?? 0) / 60; }

  const weekTotal = days.reduce((s, d) => s + hoursFor(d), 0);
  const weekGoal = goal * 5; // weekdays
  const weekLabel = `${days[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  const maxBarHours = Math.max(goal, ...days.map(hoursFor), 1);

  function saveManual(minutes: number, date: string) {
    if (IS_MOCK) mockTimeEntries.add(userId, null, minutes, date, "Manual (timesheet)");
    setAdjustDate(null);
    reload();
  }

  function exportCSV() {
    const rows = [["Data", "Dia", "Horas", `Meta (${goal}h)`, "Ocupação %"]];
    days.forEach((d) => {
      const h = hoursFor(d);
      rows.push([
        dateKey(d),
        d.toLocaleDateString("pt-BR", { weekday: "long" }),
        h.toFixed(2),
        String(goal),
        `${Math.round((h / goal) * 100)}%`,
      ]);
    });
    rows.push(["", "TOTAL", weekTotal.toFixed(2), String(weekGoal), `${Math.round((weekTotal / weekGoal) * 100)}%`]);
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `timesheet-${dateKey(days[0])}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-brand-navy">Timesheet</h2>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-neutral-400 flex items-center gap-1">
            Meta/dia:
            <input type="number" min={1} max={24} value={goal}
              onChange={(e) => updateGoal(parseFloat(e.target.value) || 8)}
              className="w-12 text-xs border border-neutral-200 rounded px-1.5 py-1 outline-none focus:border-brand-teal" />
            h
          </label>
          <button onClick={exportCSV} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-neutral-100 text-neutral-500">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-neutral-600 w-40 text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-neutral-100 text-neutral-500" disabled={weekOffset >= 0}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          const isWeekend = i >= 5;
          const hours = hoursFor(day);
          const occupancy = goal > 0 ? Math.round((hours / goal) * 100) : 0;
          const barH = Math.round((hours / maxBarHours) * 64);
          const occColor = occupancy < 70 ? "#01CFB5" : occupancy <= 100 ? "#FFB81C" : "#AC145A";
          return (
            <div key={i} className={cn(
              "rounded-xl border p-2 text-center flex flex-col",
              isToday ? "border-brand-teal bg-brand-teal/5" : "border-neutral-100 bg-white",
              isWeekend && "bg-neutral-50/60"
            )}>
              <p className={cn("text-[10px] font-medium uppercase tracking-wide", isToday ? "text-brand-teal" : "text-neutral-400")}>
                {day.toLocaleDateString("pt-BR", { weekday: "short" })}
              </p>
              <p className={cn("text-xs font-semibold", isToday ? "text-brand-teal" : "text-brand-navy")}>
                {day.getDate()}
              </p>
              {/* Visual bar (height proportional to hours) */}
              <div className="flex items-end justify-center h-16 my-1.5">
                <div className="w-5 rounded-t transition-all" style={{ height: `${Math.max(barH, hours > 0 ? 4 : 0)}px`, background: occColor }} />
              </div>
              <p className="text-[10px] font-semibold text-neutral-700">{hours > 0 ? `${hours.toFixed(1)}h` : "—"}</p>
              <p className="text-[9px]" style={{ color: hours > 0 ? occColor : "#A0A4A8" }}>{hours > 0 ? `${occupancy}%` : ""}</p>
              <button
                onClick={() => setAdjustDate(dateKey(day))}
                className="mt-1.5 text-[10px] text-brand-teal hover:underline"
              >
                Ajustar
              </button>
            </div>
          );
        })}
      </div>

      {/* Weekly total */}
      <div className="mt-4 p-4 bg-white rounded-xl border border-neutral-100 flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-400">Total da semana</p>
          <p className="text-2xl font-bold text-brand-navy">{weekTotal.toFixed(1)}h <span className="text-sm font-normal text-neutral-400">/ {weekGoal}h</span></p>
        </div>
        <div className="w-40">
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min((weekTotal / weekGoal) * 100, 100)}%` }} />
          </div>
          <p className="text-[10px] text-neutral-400 mt-1 text-right">{Math.round((weekTotal / weekGoal) * 100)}% da meta semanal</p>
        </div>
      </div>

      {adjustDate && (
        <ManualTimeModal
          taskTitle={`Registro manual — ${adjustDate}`}
          onClose={() => setAdjustDate(null)}
          onSave={(minutes) => saveManual(minutes, adjustDate)}
        />
      )}
    </div>
  );
}
