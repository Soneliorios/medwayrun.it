"use client";

import { useState, use, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Columns,
  List,
  BarChart2,
  Zap,
  SlidersHorizontal,
  CalendarDays,
  GanttChartSquare,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Users as UsersIcon,
  Layers,
  Lock,
  ArrowRight as ArrowRightIcon,
  FolderKanban,
  Check,
} from "lucide-react";
import { KanbanBoard } from "@/features/board/components/KanbanBoard";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { FilterSidebar } from "@/features/board/components/FilterSidebar";
import { BatchActionBar } from "@/features/board/components/BatchActionBar";
import { BoardListView } from "@/features/board/components/BoardListView";
import { ExportBoardButton } from "@/features/board/components/ExportBoardButton";
import { BoardDashboardView } from "@/features/board/components/BoardDashboardView";
import { BoardProjectsView } from "../../../../features/board/components/BoardProjectsView";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useBoardRealtime } from "@/features/board/hooks/useBoardRealtime";
import { useBoardData } from "@/features/board/hooks/useBoardData";
import { sweepDueDates } from "@/lib/automationEngine";
import { useBoardAccess } from "@/lib/boardAccess";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSelectionStore } from "@/features/board/store/selectionStore";
import { useFilterStore, useActiveFilterCount } from "@/features/board/store/filterStore";
import { useFilteredColumns } from "@/features/board/hooks/useFilteredColumns";
import { useBoardStore } from "@/features/board/store/boardStore";
import { useBoardProjectStore } from "@/features/board/store/boardProjectStore";
import { encodeFilters, decodeFilters } from "@/lib/filterUtils";
import { cn } from "@/lib/utils";
import { useUiPref } from "@/lib/useUiPref";
import Link from "next/link";
import { Settings, Trash2 } from "lucide-react";
import { BoardTrashModal } from "@/features/board/components/BoardTrashModal";
import { loadBoardData } from "@/features/board/hooks/useBoardData";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";

type BoardView = "kanban" | "list" | "calendar" | "gantt" | "dashboard" | "projects";

const TABS: { id: BoardView; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "kanban", label: "Kanban", icon: Columns },
  { id: "list", label: "Lista", icon: List, badge: "BETA" },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "gantt", label: "Gantt", icon: GanttChartSquare },
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "projects", label: "Projetos", icon: FolderKanban },
];

interface Props {
  params: Promise<{ id: string }>;
}

export default function BoardPage({ params }: Props) {
  const { id: boardId } = use(params);
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === boardId);

  const [activeTab, setActiveTab] = useState<BoardView>("kanban");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [deliverOnOpen, setDeliverOnOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  // Arrastar uma task para a coluna "Concluído" abre o popup de entrega.
  useEffect(() => {
    function onOpenDelivery(e: Event) {
      const { taskId } = (e as CustomEvent<{ taskId: string }>).detail;
      setDeliverOnOpen(true);
      setOpenTaskId(taskId);
    }
    window.addEventListener("open-task-delivery", onOpenDelivery);
    return () => window.removeEventListener("open-task-delivery", onOpenDelivery);
  }, []);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);

  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const filters = useFilterStore((s) => s.filters);
  const applyFilters = useFilterStore((s) => s.applyFilters);
  const loadSavedFilters = useFilterStore((s) => s.loadSavedFilters);
  const activeFilterCount = useActiveFilterCount();
  const { options: derivedOptions } = useFilteredColumns();
  const boardProjectStore = useBoardProjectStore();
  useEffect(() => { boardProjectStore.load(boardId); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { access, loading: accessLoading } = useBoardAccess(boardId);
  const orgMembers = useOrgMembers();

  useBoardData(boardId);
  useBoardRealtime(boardId);

  // Best-effort: dispara automações de "Prazo próximo" ao abrir o quadro.
  useEffect(() => { sweepDueDates(boardId); }, [boardId]);


  // Load the user's saved filters (per-user, all boards) once the profile is ready.
  const currentUserId = useAuthStore((s) => s.profile?.id);
  useEffect(() => {
    if (currentUserId) loadSavedFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Hydrate filters from URL on mount / board change.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("f");
    if (encoded) {
      const decoded = decodeFilters(encoded);
      if (decoded) applyFilters(decoded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Persist active filters to the URL (shareable) without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = encodeFilters(filters);
    if (encoded && Object.keys(filters).length > 0) params.set("f", encoded);
    else params.delete("f");
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [filters]);

  // Filter options: board-derived + projects from the project store.
  // "Criado por" lists ALL org members (not only users who already created tasks).
  const filterOptions = useMemo(
    () => ({
      ...derivedOptions,
      creators: orgMembers.map((m) => ({ value: m.id, label: m.full_name })),
      projects: projects.map((p) => ({ value: p.id, label: p.name, color: p.color })),
      boardProjects: boardProjectStore.projects.map((p) => ({ value: p.id, label: p.name, color: p.color })),
      clients: [],
      teams: [],
    }),
    [derivedOptions, orgMembers, projects, boardProjectStore.projects]
  );

  // Block access to private boards the user can't view
  if (!accessLoading && !access.canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
        <Lock size={36} className="text-neutral-300" />
        <div>
          <p className="text-base font-semibold text-brand-navy">Você não tem acesso a este quadro</p>
          <p className="text-sm text-neutral-400 mt-1">Este quadro é privado. Peça acesso a um administrador ou à liderança.</p>
        </div>
        <button onClick={() => router.push("/boards")} className="mt-2 text-sm text-brand-teal hover:underline">
          ← Voltar aos quadros
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 bg-white shrink-0">
        {/* Board name + tabs */}
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-sm" style={{ background: project?.color ?? "#00205B" }} />
            <span className="text-sm font-semibold text-brand-navy truncate max-w-[200px]">
              {project?.name ?? "Quadro"}
            </span>
          </div>

          {/* View tabs */}
          <div className="flex items-center gap-0.5">
            {TABS.map(({ id, label, icon: Icon, badge }) => (
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
                {badge && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-brand-teal/10 text-brand-teal">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => router.push(`/automations?board=${boardId}`)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-neutral-500 hover:text-brand-navy hover:bg-neutral-50 transition-colors"
          >
            <Zap size={12} />
            <span className="hidden sm:inline">Automações</span>
          </button>
          <button
            onClick={() => setFilterSidebarOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors",
              filterSidebarOpen || activeFilterCount > 0 ? "bg-brand-navy/5 text-brand-navy" : "text-neutral-500 hover:text-brand-navy hover:bg-neutral-50"
            )}
          >
            <SlidersHorizontal size={12} />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-brand-teal text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <ExportBoardButton boardId={boardId} />
          <button
            onClick={() => setTrashOpen(true)}
            title="Lixeira do quadro (tarefas apagadas, 7 dias)"
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-brand-navy hover:bg-neutral-50 transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <Link
            href={`/boards/${boardId}/settings`}
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-brand-navy hover:bg-neutral-50 transition-colors"
          >
            <Settings size={13} />
          </Link>
        </div>
      </div>

      {/* Board body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Filter sidebar */}
        {filterSidebarOpen && (
          <FilterSidebar
            onClose={() => setFilterSidebarOpen(false)}
            boardId={boardId}
            options={filterOptions}
          />
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "kanban" && (
            <KanbanBoard
              projectId={boardId}
              onTaskOpen={setOpenTaskId}
              canCreate={access.canCreate}
              onAddTask={(columnId) =>
                window.dispatchEvent(
                  new CustomEvent("open-create-task-in-column", {
                    detail: { projectId: boardId, columnId },
                  })
                )
              }
            />
          )}
          {activeTab === "list" && <BoardListView boardId={boardId} onTaskOpen={setOpenTaskId} />}
          {activeTab === "calendar" && <BoardCalendarView onTaskOpen={setOpenTaskId} />}
          {activeTab === "gantt" && <BoardGanttView onTaskOpen={setOpenTaskId} />}
          {activeTab === "dashboard" && <BoardDashboardView boardId={boardId} />}
          {activeTab === "projects" && <BoardProjectsView boardId={boardId} onTaskOpen={setOpenTaskId} />}
        </div>
      </div>

      {/* Batch action bar */}
      {selectedCount > 0 && <BatchActionBar />}

      {/* Task detail */}
      {openTaskId && (
        <TaskDetail
          taskId={openTaskId}
          autoOpenDelivery={deliverOnOpen}
          onClose={() => { setOpenTaskId(null); setDeliverOnOpen(false); }}
        />
      )}

      {/* Lixeira do quadro (tarefas apagadas nos últimos 7 dias) */}
      <BoardTrashModal
        boardId={boardId}
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={() => loadBoardData(boardId)}
      />

    </div>
  );
}

// ─── Vista Calendário ───────────────────────────────────────────────────────

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CAL_INFO_OPTIONS = [
  { id: "title", label: "Título" },
  { id: "priority", label: "Prioridade" },
  { id: "assignee", label: "Responsável" },
  { id: "type", label: "Tipo" },
  { id: "tags", label: "Tags" },
];

function BoardCalendarView({ onTaskOpen }: { onTaskOpen: (id: string) => void }) {
  const { columns } = useFilteredColumns();
  const calStore = useBoardStore();
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoFields, setInfoFields] = useUiPref<string[]>("cal_info", ["title", "priority"]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  function toggleInfo(id: string) {
    setInfoFields((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function rescheduleTask(taskId: string, date: Date) {
    const newDue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    calStore.updateTask(taskId, { due_date: newDue } as any);
    setDragTaskId(null);
  }

  // All tasks with due dates
  const tasks = columns.flatMap((c) =>
    c.tasks
      .filter((t) => t.due_date)
      .map((t) => ({ ...t, _columnName: c.name, _columnColor: c.color ?? "#A0A4A8" }))
  );

  // Group tasks by due_date string YYYY-MM-DD
  const tasksByDate = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
    const key = t.due_date!.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // ── Month view helpers ──────────────────────────────────────────────────────
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of month, padded to week start (Sunday)
  const firstOfMonth = new Date(year, month, 1);
  const startPad = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Total cells: pad + days + trailing (always 6 rows × 7 = 42)
  const totalCells = 42;
  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const offset = i - startPad;
    if (offset < 0) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth + offset + 1), isCurrentMonth: false });
    } else if (offset < daysInMonth) {
      cells.push({ date: new Date(year, month, offset + 1), isCurrentMonth: true });
    } else {
      cells.push({ date: new Date(year, month + 1, offset - daysInMonth + 1), isCurrentMonth: false });
    }
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }
  function prevWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }
  function nextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }
  function prevDay() { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d); }
  function nextDay() { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d); }
  const goPrev = () => (viewMode === "month" ? prevMonth() : viewMode === "day" ? prevDay() : prevWeek());
  const goNext = () => (viewMode === "month" ? nextMonth() : viewMode === "day" ? nextDay() : nextWeek());

  // ── Week view helpers ───────────────────────────────────────────────────────
  // Find Sunday of the current week
  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function dateKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const CHIP_MAX = 3;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-neutral-50/50">
      {/* Calendar toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-neutral-100 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-brand-navy transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-brand-navy min-w-[170px] text-center">
            {viewMode === "month"
              ? `${MONTH_NAMES[month]} ${year}`
              : viewMode === "day"
              ? `${currentDate.getDate()} ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : (() => {
                  const ws = weekDays[0]; const we = weekDays[6];
                  return `${ws.getDate()} ${MONTH_NAMES[ws.getMonth()].slice(0, 3)} – ${we.getDate()} ${MONTH_NAMES[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
                })()}
          </span>
          <button onClick={goNext} className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-brand-navy transition-colors">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="ml-1 text-xs px-2 py-1 rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy hover:border-brand-navy/30 transition-colors">
            Hoje
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Info selector */}
          <div className="relative">
            <button onClick={() => setInfoOpen((v) => !v)} title="Configurar informações exibidas"
              className={cn("w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200", infoOpen ? "text-brand-navy bg-neutral-50" : "text-neutral-500 hover:text-brand-navy")}>
              <SlidersHorizontal size={13} />
            </button>
            {infoOpen && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 p-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs font-semibold text-brand-navy mb-2">Informações nos cards</p>
                {CAL_INFO_OPTIONS.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={infoFields.includes(o.id)} onChange={() => toggleInfo(o.id)} className="w-3 h-3 accent-brand-teal" />
                    <span className="text-xs text-neutral-600">{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
            {(["month", "week", "day"] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={cn("px-3 py-1 rounded-md text-xs font-medium transition-colors", viewMode === m ? "bg-white text-brand-navy shadow-sm" : "text-neutral-500 hover:text-brand-navy")}>
                {m === "month" ? "Mês" : m === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Weekday header */}
      {viewMode !== "day" && (
        <div className="grid grid-cols-7 bg-white border-b border-neutral-100 shrink-0">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-neutral-400">{d}</div>
          ))}
        </div>
      )}

      {/* Calendar body */}
      {viewMode === "month" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 h-full" style={{ minHeight: "480px" }}>
            {cells.map((cell, i) => {
              const key = dateKey(cell.date);
              const dayTasks = tasksByDate[key] ?? [];
              const isToday = key === todayStr;
              const visible = dayTasks.slice(0, CHIP_MAX - 1);
              const overflow = dayTasks.length - visible.length;

              return (
                <div
                  key={i}
                  onDragOver={(e) => { if (dragTaskId) e.preventDefault(); }}
                  onDrop={() => dragTaskId && rescheduleTask(dragTaskId, cell.date)}
                  className={cn(
                    "border-b border-r border-neutral-100 p-1.5 min-h-[90px] flex flex-col gap-1 transition-colors",
                    !cell.isCurrentMonth && "bg-neutral-50/70",
                    dragTaskId && "hover:bg-brand-teal/5",
                    i % 7 === 0 && "border-l-0"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full self-start leading-none",
                      isToday ? "bg-brand-teal text-white" : cell.isCurrentMonth ? "text-neutral-700" : "text-neutral-300"
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                  {visible.map((t) => (
                    <CalChip key={t.id} task={t} infoFields={infoFields} onOpen={onTaskOpen} onDragStart={() => setDragTaskId(t.id)} onDragEnd={() => setDragTaskId(null)} />
                  ))}
                  {overflow > 0 && <span className="text-[10px] text-neutral-400 pl-1">+{overflow} mais</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === "day" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-1.5">
            {(tasksByDate[dateKey(currentDate)] ?? []).map((t) => (
              <CalChip key={t.id} task={t} infoFields={infoFields} onOpen={onTaskOpen} onDragStart={() => setDragTaskId(t.id)} onDragEnd={() => setDragTaskId(null)} block />
            ))}
            {(tasksByDate[dateKey(currentDate)] ?? []).length === 0 && (
              <div className="text-center py-16 text-neutral-300 text-sm">Nenhuma tarefa com entrega neste dia.</div>
            )}
          </div>
        </div>
      ) : (
        /* Week view */
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 divide-x divide-neutral-100 h-full" style={{ minHeight: "480px" }}>
            {weekDays.map((d) => {
              const key = dateKey(d);
              const dayTasks = tasksByDate[key] ?? [];
              const isToday = key === todayStr;
              return (
                <div
                  key={key}
                  onDragOver={(e) => { if (dragTaskId) e.preventDefault(); }}
                  onDrop={() => dragTaskId && rescheduleTask(dragTaskId, d)}
                  className={cn("p-2 flex flex-col gap-1.5 transition-colors", isToday && "bg-brand-teal/5", dragTaskId && "hover:bg-brand-teal/10")}
                >
                  <span className={cn("text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full self-center leading-none", isToday ? "bg-brand-teal text-white" : "text-neutral-700")}>
                    {d.getDate()}
                  </span>
                  {dayTasks.map((t) => (
                    <CalChip key={t.id} task={t} infoFields={infoFields} onOpen={onTaskOpen} onDragStart={() => setDragTaskId(t.id)} onDragEnd={() => setDragTaskId(null)} block />
                  ))}
                  {dayTasks.length === 0 && <span className="text-[10px] text-neutral-300 text-center mt-2">—</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CalChip({ task, infoFields, onOpen, onDragStart, onDragEnd, block }: {
  task: any; infoFields: string[]; onOpen: (id: string) => void; onDragStart: () => void; onDragEnd: () => void; block?: boolean;
}) {
  const color = PRIORITY_COLORS[(task.priority ?? "medium") as keyof typeof PRIORITY_COLORS];
  const assigneeName = task.assignee?.full_name ?? (task.assignees?.[0] as any)?.profile?.full_name ?? task.assignee_id;
  const typeName = task.task_type?.name ?? task.task_type;
  // Tarefas entregues aparecem visualmente distintas: verde-teal, ✓ e riscado.
  const delivered = task.status === "delivered";
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task.id)}
      className={cn("w-full text-left rounded font-medium transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing", block ? "px-2 py-1.5 text-[11px]" : "px-1.5 py-0.5 text-[10px] leading-tight truncate")}
      style={delivered ? { background: "rgba(1,207,181,0.15)", color: "#01a890" } : { background: `${color}22`, color }}
      title={delivered ? `✔ Entregue — ${task.title}` : task.title}
    >
      <span className="flex items-center gap-1">
        {delivered ? (
          <Check size={block ? 12 : 10} strokeWidth={3} className="shrink-0" />
        ) : (
          infoFields.includes("priority") && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        )}
        <span className={cn("truncate", delivered && "line-through", !infoFields.includes("title") && "sr-only")}>{task.title}</span>
      </span>
      {block && (
        <span className="flex items-center gap-2 mt-0.5 text-[9px] text-neutral-500">
          {infoFields.includes("assignee") && assigneeName && <span>👤 {String(assigneeName).split(" ")[0]}</span>}
          {infoFields.includes("type") && typeName && <span>🏷 {typeName}</span>}
          {infoFields.includes("tags") && (task.labels?.length ?? 0) > 0 && <span>{task.labels.map((l: any) => l.name).slice(0, 2).join(", ")}</span>}
          <span className="text-neutral-400">{task._columnName}</span>
        </span>
      )}
    </button>
  );
}


// ─── Vista Gantt (aprimorada) ─────────────────────────────────────────────────

const GANTT_MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const GANTT_ZOOMS = [
  { id: "month", label: "Mês", dayPx: 11, labelEvery: 7 },
  { id: "fortnight", label: "Quinzena", dayPx: 22, labelEvery: 7 },
  { id: "week", label: "Semana", dayPx: 40, labelEvery: 1 },
] as const;
type GanttZoom = (typeof GANTT_ZOOMS)[number]["id"];
type GanttGroupBy = "none" | "assignee" | "type" | "project" | "stage";

const GROUP_OPTIONS: { id: GanttGroupBy; label: string }[] = [
  { id: "none", label: "Sem agrupamento" },
  { id: "assignee", label: "Por responsável" },
  { id: "type", label: "Por tipo" },
  { id: "project", label: "Por projeto" },
  { id: "stage", label: "Por etapa" },
];

function ganttAssigneeNames(t: any): string[] {
  if (t.assignees?.length) return t.assignees.map((a: any) => a.profile?.full_name ?? a.user_id);
  if (t.assignee?.full_name) return [t.assignee.full_name];
  if (t.assignee_id) return [t.assignee_id];
  return [];
}
function ganttInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}

function BoardGanttView({ onTaskOpen }: { onTaskOpen: (id: string) => void }) {
  const { columns } = useFilteredColumns();
  const [zoom, setZoom] = useState<GanttZoom>("fortnight");
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("none");
  const [showCapacity, setShowCapacity] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const allTasks = columns.flatMap((c) =>
    c.tasks.map((t) => ({ ...t, _columnName: c.name, _columnColor: c.color ?? "#A0A4A8" }))
  );
  const tasksWithDates = allTasks.filter((t) => t.due_date || t.start_date || t.created_at);

  const zoomCfg = GANTT_ZOOMS.find((z) => z.id === zoom)!;
  const DAY_PX = zoomCfg.dayPx;

  function parseDate(s: string | null | undefined): Date | null {
    if (!s) return null;
    const d = new Date(s.slice(0, 10) + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group tasks
  function groupKey(t: any): string {
    switch (groupBy) {
      case "assignee": return ganttAssigneeNames(t)[0] ?? "Sem responsável";
      case "type": return t.task_type?.name ?? (t as any).task_type ?? "Sem tipo";
      case "project": return "Projeto atual";
      case "stage": return t._columnName;
      default: return "__all__";
    }
  }
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    tasksWithDates.forEach((t) => {
      const k = groupKey(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksWithDates, groupBy]);

  if (tasksWithDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <GanttChartSquare size={40} className="text-neutral-200" />
        <p className="text-sm text-neutral-400 max-w-xs">
          Adicione datas de entrega às tarefas para visualizar o Gantt.
        </p>
      </div>
    );
  }

  const allStartDates = tasksWithDates.map((t) => parseDate(t.start_date ?? t.created_at)).filter(Boolean) as Date[];
  const allEndDates = tasksWithDates.map((t) => parseDate(t.due_date)).filter(Boolean) as Date[];
  const thirtyDaysOut = new Date(today); thirtyDaysOut.setDate(today.getDate() + 30);
  const minDate = allStartDates.length ? new Date(Math.min(...allStartDates.map((d) => d.getTime()))) : new Date(today);
  const maxDate = allEndDates.length
    ? new Date(Math.max(Math.max(...allEndDates.map((d) => d.getTime())), thirtyDaysOut.getTime()))
    : thirtyDaysOut;
  const rangeStart = new Date(minDate); rangeStart.setDate(rangeStart.getDate() - 2);
  const rangeEnd = new Date(maxDate); rangeEnd.setDate(rangeEnd.getDate() + 2);
  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
  const timelineWidth = totalDays * DAY_PX;

  function dayOffset(d: Date): number {
    return Math.floor((d.getTime() - rangeStart.getTime()) / 86400000);
  }
  const headerDates: Date[] = [];
  for (let i = 0; i <= totalDays; i += zoomCfg.labelEvery) {
    const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i); headerDates.push(d);
  }
  const todayOffset = dayOffset(today);
  const LEFT_PANEL_W = 460;

  // Per-day capacity: sum estimated hours of tasks active that day / 8h
  function dayCapacity(dayIdx: number): number {
    let hours = 0;
    tasksWithDates.forEach((t) => {
      const s = parseDate(t.start_date ?? t.created_at) ?? today;
      const e = parseDate(t.due_date) ?? s;
      const so = dayOffset(s), eo = Math.max(so, dayOffset(e));
      if (dayIdx >= so && dayIdx <= eo) {
        const span = Math.max(1, eo - so + 1);
        hours += ((t as any).estimated_hours ?? 0) / span;
      }
    });
    return hours / 8; // ratio vs 8h/day
  }
  function capacityColor(ratio: number): string {
    return ratio <= 0.7 ? "#01CFB5" : ratio <= 0.9 ? "#FFB81C" : "#AC145A";
  }

  function scrollToToday() {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * DAY_PX - 200);
    }
  }
  function toggleCollapse(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  return (
    <div className={cn("flex flex-col overflow-hidden bg-neutral-50/50", fullscreen ? "fixed inset-0 z-50 bg-white" : "h-full")}>
      {/* Gantt toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-white shrink-0">
        {/* Group by */}
        <div className="flex items-center gap-1.5">
          <Layers size={13} className="text-neutral-400" />
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GanttGroupBy)}
            className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-brand-teal"
          >
            {GROUP_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        {/* Capacity toggle */}
        <button
          onClick={() => setShowCapacity((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border",
            showCapacity ? "border-brand-teal/40 bg-brand-teal/5 text-brand-teal" : "border-neutral-200 text-neutral-500 hover:text-brand-navy"
          )}
        >
          <UsersIcon size={12} /> Ver capacidade
        </button>

        <div className="flex-1" />

        {/* Today */}
        <button
          onClick={scrollToToday}
          className="text-xs px-2.5 py-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy hover:border-brand-navy/30 transition-colors"
        >
          Hoje
        </button>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
          {GANTT_ZOOMS.map((z) => (
            <button
              key={z.id}
              onClick={() => setZoom(z.id)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                zoom === z.id ? "bg-white text-brand-navy shadow-sm" : "text-neutral-500 hover:text-brand-navy"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Fullscreen */}
        <button
          onClick={() => setFullscreen((v) => !v)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: `${LEFT_PANEL_W + timelineWidth}px` }}>
          {/* Header row */}
          <div className="flex sticky top-0 z-30">
            <div
              className="shrink-0 sticky left-0 z-40 bg-white border-b border-r border-neutral-100 flex items-center px-3 py-2 gap-2"
              style={{ width: LEFT_PANEL_W }}
            >
              <span className="text-xs font-semibold text-neutral-500 flex-1">Tarefa</span>
              <span className="text-[10px] text-neutral-400 w-20 text-center">Resp.</span>
              <span className="text-[10px] text-neutral-400 w-16 text-center">Tipo</span>
              <span className="text-[10px] text-neutral-400 w-20 text-center">Cliente</span>
              <span className="text-[10px] text-neutral-400 w-20 text-center">Grupo</span>
              <span className="w-7" />
            </div>
            <div className="bg-white border-b border-neutral-100 relative" style={{ width: timelineWidth }}>
              <div className="relative h-9" style={{ width: timelineWidth }}>
                {headerDates.map((d, i) => (
                  <div key={i} className="absolute top-0 flex flex-col items-start" style={{ left: dayOffset(d) * DAY_PX }}>
                    <span className="text-[10px] font-semibold text-neutral-500 pl-1 pt-1 whitespace-nowrap">
                      {d.getDate()} {GANTT_MONTH_SHORT[d.getMonth()]}
                    </span>
                    <div className="w-px h-2 bg-neutral-200 ml-1" />
                  </div>
                ))}
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div className="absolute top-0 bottom-0 w-px bg-brand-teal/40" style={{ left: todayOffset * DAY_PX }} />
                )}
              </div>
            </div>
          </div>

          {/* Capacity band */}
          {showCapacity && (
            <div className="flex border-b border-neutral-100 bg-white">
              <div className="shrink-0 sticky left-0 z-20 bg-white border-r border-neutral-100 flex items-center px-3 py-1" style={{ width: LEFT_PANEL_W }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Capacidade / dia</span>
              </div>
              <div className="relative" style={{ width: timelineWidth, height: 28 }}>
                {Array.from({ length: totalDays }).map((_, i) => {
                  const ratio = dayCapacity(i);
                  if (ratio <= 0) return null;
                  return (
                    <div
                      key={i}
                      className="absolute bottom-0"
                      title={`${Math.round(ratio * 100)}% ocupação`}
                      style={{
                        left: i * DAY_PX + 1,
                        width: Math.max(DAY_PX - 2, 2),
                        height: `${Math.min(ratio, 1) * 100}%`,
                        background: capacityColor(ratio),
                        opacity: 0.8,
                        borderRadius: 2,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Groups */}
          {groups.map(([groupName, groupTasks]) => {
            const isCollapsed = collapsed.has(groupName);
            return (
              <div key={groupName}>
                {groupBy !== "none" && (
                  <div className="flex items-center sticky left-0" style={{ minWidth: `${LEFT_PANEL_W + timelineWidth}px` }}>
                    <div
                      className="shrink-0 sticky left-0 z-20 bg-neutral-50 border-b border-r border-neutral-100 flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-100/60"
                      style={{ width: LEFT_PANEL_W }}
                      onClick={() => toggleCollapse(groupName)}
                    >
                      {isCollapsed ? <ChevronRight size={12} className="text-neutral-400" /> : <ChevronLeft size={12} className="rotate-[-90deg] text-neutral-400" />}
                      <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide truncate">{groupName}</span>
                      <span className="text-[10px] text-neutral-400 ml-auto">{groupTasks.length}</span>
                    </div>
                    <div className="bg-neutral-50 border-b border-neutral-100" style={{ width: timelineWidth }} />
                  </div>
                )}

                {!isCollapsed && groupTasks.map((task: any) => {
                  const taskStart = parseDate(task.start_date ?? task.created_at) ?? today;
                  const taskEnd = parseDate(task.due_date) ?? taskStart;
                  const startOff = Math.max(0, dayOffset(taskStart));
                  const endOff = Math.max(startOff + 1, dayOffset(taskEnd));
                  const barWidth = Math.max((endOff - startOff) * DAY_PX, DAY_PX);
                  const barLeft = startOff * DAY_PX;
                  const color = PRIORITY_COLORS[(task.priority ?? "medium") as keyof typeof PRIORITY_COLORS];
                  const isPoint = !task.due_date;
                  const names = ganttAssigneeNames(task);
                  const est = (task as any).estimated_hours ?? 0;
                  const tracked = task.tracked_hours ?? 0;
                  const progress = est > 0 ? Math.min(tracked / est, 1) : 0;
                  const typeName = task.task_type?.name ?? (task as any).task_type;

                  return (
                    <div key={task.id} className="flex items-center group" style={{ minWidth: `${LEFT_PANEL_W + timelineWidth}px` }}>
                      {/* Left panel: title + assignees + type */}
                      <div
                        className="shrink-0 sticky left-0 z-10 bg-white border-b border-r border-neutral-100 flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50/80 transition-colors"
                        style={{ width: LEFT_PANEL_W }}
                        onClick={() => onTaskOpen(task.id)}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-xs text-neutral-700 truncate flex-1 group-hover:text-brand-navy transition-colors">{task.title}</span>
                        <div className="flex -space-x-1 w-20 justify-center shrink-0">
                          {names.length === 0 ? (
                            <span className="text-[10px] text-neutral-300">—</span>
                          ) : names.slice(0, 2).map((n, i) => (
                            <span key={i} title={n} className="w-5 h-5 rounded-full bg-brand-navy/10 text-brand-navy text-[8px] font-bold flex items-center justify-center border border-white">
                              {ganttInitials(n)}
                            </span>
                          ))}
                        </div>
                        <div className="w-16 flex justify-center shrink-0">
                          {typeName ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-navy/5 text-brand-navy truncate">{typeName}</span>
                          ) : <span className="text-[10px] text-neutral-300">—</span>}
                        </div>
                        {/* Cliente */}
                        <div className="w-20 flex justify-center shrink-0">
                          <span className="text-[10px] text-neutral-400 truncate" title={(task as any).client_name ?? ""}>{(task as any).client_name ?? "—"}</span>
                        </div>
                        {/* Grupo (etapa) */}
                        <div className="w-20 flex justify-center shrink-0">
                          <span className="text-[10px] text-neutral-500 truncate" title={task._columnName}>{task._columnName}</span>
                        </div>
                        {/* Abrir */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onTaskOpen(task.id); }}
                          className="w-7 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy hover:bg-neutral-100 shrink-0"
                          title="Abrir tarefa"
                        >
                          <ArrowRightIcon size={13} />
                        </button>
                      </div>

                      {/* Timeline */}
                      <div className="border-b border-neutral-100 relative" style={{ width: timelineWidth, height: 36 }}>
                        {todayOffset >= 0 && todayOffset <= totalDays && (
                          <div className="absolute top-0 bottom-0 w-px bg-brand-teal/20" style={{ left: todayOffset * DAY_PX }} />
                        )}
                        {isPoint ? (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm cursor-pointer hover:scale-110 transition-transform"
                            style={{ left: barLeft - 6, background: color }}
                            onClick={() => onTaskOpen(task.id)}
                            title={task.title}
                          />
                        ) : (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer hover:brightness-110 transition-all overflow-hidden"
                            style={{ left: barLeft, width: barWidth, background: `${color}26`, borderLeft: `3px solid ${color}` }}
                            onClick={() => onTaskOpen(task.id)}
                            title={`${task.title} — ${Math.round(progress * 100)}% do tempo estimado`}
                          >
                            {/* progress fill */}
                            {est > 0 && (
                              <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: `${color}55` }} />
                            )}
                            {barWidth > 60 && (
                              <span className="relative text-[10px] font-medium truncate px-2 leading-5 block" style={{ color }}>
                                {task.title}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
