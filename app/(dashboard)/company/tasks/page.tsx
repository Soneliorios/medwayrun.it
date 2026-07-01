"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ListTodo,
  Search,
  SlidersHorizontal,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  CalendarDays,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createRawClient } from "@/services/supabase/client";
import { IS_MOCK } from "@/lib/mockDb";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";
import type { TaskWithRelations } from "@/types";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";

type FilterState = {
  search: string;
  projectId: string | null;
  priority: string | null;
  status: string | null;
  onlyOverdue: boolean;
  onlyUrgent: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  delivered: "Entregue",
  archived: "Arquivada",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#A0A4A8",
  in_progress: "#407EC9",
  delivered: "#01CFB5",
  archived: "#E5E7EB",
};

type TaskRow = TaskWithRelations & {
  _projectName?: string;
  _columnName?: string;
  _columnColor?: string;
};

export default function CompanyTasksPage() {
  const projects = useProjectStore((s) => s.projects);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    projectId: null,
    priority: null,
    status: null,
    onlyOverdue: false,
    onlyUrgent: false,
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (IS_MOCK) {
        // Load all tasks from all projects in localStorage
        const allTasksRaw = (() => {
          try { const r = localStorage.getItem("mwr_tasks"); return r ? JSON.parse(r) : []; } catch { return []; }
        })();
        const allColumnsRaw = (() => {
          try { const r = localStorage.getItem("mwr_columns"); return r ? JSON.parse(r) : []; } catch { return []; }
        })();
        const allProjectsRaw = (() => {
          try { const r = localStorage.getItem("mwr_projects"); return r ? JSON.parse(r) : []; } catch { return []; }
        })();

        let rows: TaskRow[] = allTasksRaw.map((t: any) => {
          const col = allColumnsRaw.find((c: any) => c.id === t.column_id);
          const proj = allProjectsRaw.find((p: any) => p.id === t.project_id);
          return {
            ...t,
            labels: [],
            assignee: null,
            _commentCount: 0,
            _projectName: proj?.name ?? "—",
            _columnName: col?.name ?? "—",
            _columnColor: col?.color ?? "#A0A4A8",
          };
        });

        if (filters.projectId) rows = rows.filter(t => t.project_id === filters.projectId);
        if (filters.priority) rows = rows.filter(t => t.priority === filters.priority);
        if (filters.status) rows = rows.filter(t => (t as any).status === filters.status);
        if (filters.onlyUrgent) rows = rows.filter(t => (t as any).is_urgent);
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setTasks(rows);
        setLoading(false);
        return;
      }

      const supabase = createRawClient();
      let query = supabase
        .from("tasks")
        .select(`
          *,
          columns:columns(id, name, color),
          projects:projects(id, name, color)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters.projectId) query = query.eq("project_id", filters.projectId);
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.onlyUrgent) query = query.eq("is_urgent", true);

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;

      const rows: TaskRow[] = (data ?? []).map((t: any) => ({
        ...t,
        _projectName: t.projects?.name ?? "—",
        _columnName: t.columns?.name ?? "—",
        _columnColor: t.columns?.color ?? "#A0A4A8",
      }));

      setTasks(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Client-side search + overdue filter
  const visibleTasks = tasks.filter((t) => {
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    if (filters.onlyOverdue) {
      if (!t.due_date || new Date(t.due_date) >= new Date()) return false;
      if (t.status === "delivered") return false;
    }
    return true;
  });

  // Pagination
  const total = visibleTasks.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageTasks = visibleTasks.slice(pageStart, pageStart + pageSize);

  function exportCSV() {
    const header = ["Tarefa", "Quadro", "Etapa", "Prioridade", "Status", "Prazo", "Criada em"];
    const rows = visibleTasks.map((t) => [
      t.title,
      t._projectName ?? "",
      t._columnName ?? "",
      PRIORITY_LABELS[t.priority ?? "medium"],
      STATUS_LABELS[(t as any).status ?? "open"],
      t.due_date ?? "",
      t.created_at?.slice(0, 10) ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tarefas-empresa.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const activeFilterCount = [
    filters.projectId,
    filters.priority,
    filters.status,
    filters.onlyOverdue,
    filters.onlyUrgent,
  ].filter(Boolean).length;

  function clearFilters() {
    setFilters({
      search: "",
      projectId: null,
      priority: null,
      status: null,
      onlyOverdue: false,
      onlyUrgent: false,
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <ListTodo size={15} className="text-brand-navy shrink-0" />
        <h1 className="text-sm font-semibold text-brand-navy">Todas as tarefas</h1>
        <span className="text-xs text-neutral-400">— visão global</span>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Buscar tarefas..."
            className="pl-7 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none focus:border-brand-teal transition-colors w-44"
          />
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setFiltersVisible((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
            filtersVisible || activeFilterCount > 0
              ? "bg-brand-navy/5 text-brand-navy font-medium"
              : "text-neutral-500 hover:bg-neutral-100"
          )}
        >
          <SlidersHorizontal size={13} />
          Filtros
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-brand-teal text-white text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          title="Exportar CSV"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-brand-navy transition-colors"
        >
          <Download size={13} />
        </button>

        {/* Refresh */}
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-brand-navy transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter bar */}
      {filtersVisible && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-neutral-100 bg-white/80 shrink-0 flex-wrap">
          {/* Project */}
          <FilterSelect
            label="Quadro"
            value={filters.projectId}
            onClear={() => setFilters((f) => ({ ...f, projectId: null }))}
          >
            <select
              value={filters.projectId ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, projectId: e.target.value || null }))
              }
              className="text-xs outline-none bg-transparent max-w-[140px]"
            >
              <option value="">Todos os quadros</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FilterSelect>

          {/* Priority */}
          <FilterSelect
            label="Prioridade"
            value={filters.priority}
            onClear={() => setFilters((f) => ({ ...f, priority: null }))}
          >
            <select
              value={filters.priority ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, priority: e.target.value || null }))
              }
              className="text-xs outline-none bg-transparent"
            >
              <option value="">Todas</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </FilterSelect>

          {/* Status */}
          <FilterSelect
            label="Status"
            value={filters.status}
            onClear={() => setFilters((f) => ({ ...f, status: null }))}
          >
            <select
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value || null }))
              }
              className="text-xs outline-none bg-transparent"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </FilterSelect>

          {/* Overdue toggle */}
          <button
            onClick={() => setFilters((f) => ({ ...f, onlyOverdue: !f.onlyOverdue }))}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
              filters.onlyOverdue
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            )}
          >
            <CalendarDays size={11} />
            Atrasadas
          </button>

          {/* Urgent toggle */}
          <button
            onClick={() => setFilters((f) => ({ ...f, onlyUrgent: !f.onlyUrgent }))}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
              filters.onlyUrgent
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            )}
          >
            <Flag size={11} />
            Urgentes
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 ml-1 transition-colors"
            >
              <X size={11} />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchTasks}
              className="text-xs text-brand-teal hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={18} className="animate-spin text-neutral-300" />
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <ListTodo size={28} className="text-neutral-200" />
            <p className="text-sm text-neutral-400">
              {activeFilterCount > 0 || filters.search
                ? "Nenhuma tarefa encontrada com esses filtros"
                : "Nenhuma tarefa encontrada"}
            </p>
            {(activeFilterCount > 0 || filters.search) && (
              <button
                onClick={clearFilters}
                className="text-xs text-brand-teal hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white border-b border-neutral-100 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-2.5 text-left w-4/12">
                  <span className="text-xs font-medium text-neutral-400">Tarefa</span>
                </th>
                <th className="px-3 py-2.5 text-left w-2/12">
                  <span className="text-xs font-medium text-neutral-400">Quadro</span>
                </th>
                <th className="px-3 py-2.5 text-left w-2/12">
                  <span className="text-xs font-medium text-neutral-400">Etapa</span>
                </th>
                <th className="px-3 py-2.5 text-left w-1/12">
                  <span className="text-xs font-medium text-neutral-400">Prioridade</span>
                </th>
                <th className="px-3 py-2.5 text-left w-1/12">
                  <span className="text-xs font-medium text-neutral-400">Status</span>
                </th>
                <th className="px-3 py-2.5 text-left w-1/12">
                  <span className="text-xs font-medium text-neutral-400">Prazo</span>
                </th>
                <th className="px-3 py-2.5 text-left w-1/12">
                  <span className="text-xs font-medium text-neutral-400">Criada em</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageTasks.map((task) => {
                const isOverdue =
                  task.due_date &&
                  new Date(task.due_date) < new Date() &&
                  task.status !== "delivered";
                const priorityColor = PRIORITY_COLORS[task.priority ?? "medium"];
                const statusColor = STATUS_COLORS[task.status ?? "open"];

                return (
                  <tr
                    key={task.id}
                    onClick={() => setOpenTaskId(task.id)}
                    className="group border-b border-neutral-50 hover:bg-white transition-colors cursor-pointer"
                  >
                    {/* Title */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-0.5 h-5 rounded-full shrink-0"
                          style={{ background: priorityColor, opacity: 0.7 }}
                        />
                        {task.is_urgent && (
                          <Flag
                            size={11}
                            className="text-destructive fill-current shrink-0"
                          />
                        )}
                        <span
                          className={cn(
                            "text-sm text-neutral-800 line-clamp-1",
                            task.status === "delivered" &&
                              "line-through text-neutral-400"
                          )}
                        >
                          {task.title}
                        </span>
                      </div>
                    </td>

                    {/* Project */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-neutral-600 truncate max-w-[120px] block">
                        {task._projectName}
                      </span>
                    </td>

                    {/* Column */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: task._columnColor }}
                        />
                        <span className="truncate max-w-[90px]">
                          {task._columnName}
                        </span>
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-2.5">
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          background: `${priorityColor}18`,
                          color: priorityColor,
                        }}
                      >
                        {PRIORITY_LABELS[task.priority ?? "medium"]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          background: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        {STATUS_LABELS[task.status ?? "open"]}
                      </span>
                    </td>

                    {/* Due date */}
                    <td className="px-3 py-2.5">
                      {task.due_date ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isOverdue ? "text-destructive" : "text-neutral-600"
                          )}
                        >
                          {new Date(
                            task.due_date + "T00:00:00"
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                          {isOverdue && " ⚠️"}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>

                    {/* Created at */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-neutral-400">
                        {new Date(task.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer stats + pagination */}
      {visibleTasks.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-t border-neutral-100 bg-white flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            {pageStart + 1}-{Math.min(pageStart + pageSize, total)} de {total}
            {filters.search || activeFilterCount > 0 ? ` (filtradas de ${tasks.length})` : ""}
          </span>
          <div className="flex-1" />
          <label className="text-[11px] text-neutral-400 flex items-center gap-1">
            Por página:
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(0); }}
              className="text-xs border border-neutral-200 rounded px-1.5 py-1 outline-none focus:border-brand-teal"
            >
              {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:text-brand-navy">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:text-brand-navy">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {openTaskId && (
        <TaskDetail taskId={openTaskId} onClose={() => { setOpenTaskId(null); fetchTasks(); }} />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  children,
  onClear,
}: {
  label: string;
  value: string | null;
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
        value
          ? "border-brand-teal/30 bg-brand-teal/5 text-brand-navy"
          : "border-neutral-200 text-neutral-500"
      )}
    >
      <ChevronDown size={10} className="shrink-0 text-neutral-400" />
      {children}
      {value && (
        <button
          onClick={onClear}
          className="ml-0.5 text-neutral-400 hover:text-neutral-600"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
