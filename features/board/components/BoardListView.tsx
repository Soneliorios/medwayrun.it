"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Settings2,
  ArrowUp,
  ArrowDown,
  Pin,
  EyeOff,
  GripVertical,
  X,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiPref } from "@/lib/useUiPref";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";
import { useFilteredColumns } from "../hooks/useFilteredColumns";
import { useSelectionStore } from "../store/selectionStore";
import { useBoardStore } from "../store/boardStore";
import { taskService } from "@/features/tasks/services/taskService";
import { runAutomations } from "@/lib/automationEngine";
import { MoreHorizontal } from "lucide-react";
import type { TaskWithRelations } from "@/types";

const APPROVAL_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "#FFB81C" },
  approved: { label: "Aprovada", color: "#01CFB5" },
  rejected: { label: "Rejeitada", color: "#AC145A" },
};
function approvalStatus(_taskId: string): string | null {
  return null;
}

// ── Column registry ──────────────────────────────────────────────────────────

type ColKey =
  | "title" | "id" | "stage" | "type" | "priority" | "due_date"
  | "assignees" | "created_by" | "created_at" | "start_date" | "desired_start"
  | "estimated" | "tracked" | "tags" | "comments" | "attachments"
  | "project" | "client" | "area_req" | "area_reqd" | "followers"
  | "approval" | "checklist";

interface ColDef {
  key: ColKey;
  label: string;
  width: number;
  sortable?: boolean;
  fixed?: boolean; // title is always fixed
}

const ALL_COLUMNS: ColDef[] = [
  { key: "title", label: "Título", width: 280, sortable: true, fixed: true },
  { key: "id", label: "ID", width: 90, sortable: true },
  { key: "stage", label: "Etapa", width: 140, sortable: true },
  { key: "type", label: "Tipo", width: 110 },
  { key: "priority", label: "Prioridade", width: 110, sortable: true },
  { key: "due_date", label: "Prazo", width: 110, sortable: true },
  { key: "assignees", label: "Responsáveis", width: 130 },
  { key: "created_by", label: "Criado por", width: 120 },
  { key: "created_at", label: "Criação", width: 110, sortable: true },
  { key: "start_date", label: "Início", width: 110, sortable: true },
  { key: "estimated", label: "Estimado", width: 90, sortable: true },
  { key: "tracked", label: "Registrado", width: 130, sortable: true },
  { key: "tags", label: "Tags", width: 150 },
  { key: "comments", label: "Coment.", width: 80 },
  { key: "attachments", label: "Anexos", width: 80 },
  { key: "project", label: "Projeto", width: 140 },
  { key: "client", label: "Cliente", width: 130 },
  { key: "area_req", label: "Área Solic.", width: 120 },
  { key: "area_reqd", label: "Área Solicitada", width: 130 },
  { key: "followers", label: "Seguidores", width: 120 },
  { key: "desired_start", label: "Início desejado", width: 120, sortable: true },
  { key: "approval", label: "Aprovação", width: 120 },
  { key: "checklist", label: "Checklist", width: 110 },
];

const DEFAULT_VISIBLE: ColKey[] = [
  "title", "id", "stage", "priority", "due_date", "assignees", "tracked", "tags", "comments",
];

const SORT_OPTIONS: { value: ColKey | "activity"; label: string }[] = [
  { value: "activity", label: "Atividade" },
  { value: "title", label: "Título" },
  { value: "due_date", label: "Prazo" },
  { value: "priority", label: "Prioridade" },
  { value: "created_at", label: "Criação" },
  { value: "stage", label: "Etapa" },
];

const PAGE_SIZE = 20;
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface ListConfig {
  visible: ColKey[]; // ordered + visible
  pinned: ColKey[];
  widths: Partial<Record<ColKey, number>>;
}


function attachmentsCount(task: any): number {
  return (task?._attachmentCount as number) ?? 0;
}

type ListTask = TaskWithRelations & { _columnName: string; _columnColor: string };

// ── Component ──────────────────────────────────────────────────────────────────

export function BoardListView({ boardId, onTaskOpen }: { boardId: string; onTaskOpen: (id: string) => void }) {
  const { columns, rawColumns } = useFilteredColumns();
  const { toggleTask, selectedIds, selectAll, clearSelection } = useSelectionStore();
  const boardStore = useBoardStore();
  const [rowMenu, setRowMenu] = useState<string | null>(null);

  function moveTaskTo(taskId: string, colId: string) {
    const current = boardStore.columns.find((c) => c.tasks.some((t) => t.id === taskId))?.id;
    if (current === colId) { setRowMenu(null); return; }
    boardStore.moveTask(taskId, colId, 1000);
    setRowMenu(null);
    // Persist (this path previously only updated the UI) and fire automations.
    taskService.update(taskId, { column_id: colId, position: 1000 } as any)
      .then(() => runAutomations({ type: "stage_entered" }, taskId))
      .catch(() => { if (current) boardStore.moveTask(taskId, current, 1000); }); // rollback
  }
  function deleteTask(taskId: string) {
    if (!confirm("Excluir esta tarefa? Ela vai para a Lixeira do quadro e pode ser recuperada por 7 dias.")) return;
    boardStore.removeTask(taskId);
    setRowMenu(null);
    // Soft delete real (antes só sumia da UI e voltava ao recarregar).
    taskService.delete(taskId).catch((e) => console.error("[BoardListView.deleteTask]", e));
  }
  function duplicateTask(_t: ListTask) {
    setRowMenu(null);
  }

  const [config, setConfig] = useUiPref<ListConfig>(`listcfg_${boardId}`, { visible: DEFAULT_VISIBLE, pinned: ["title"], widths: {} });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ColKey | "activity">("activity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [headerMenu, setHeaderMenu] = useState<ColKey | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const allTasks: ListTask[] = useMemo(
    () =>
      columns.flatMap((col) =>
        col.tasks.map((t) => ({ ...t, _columnName: col.name, _columnColor: col.color ?? "#A0A4A8" }))
      ),
    [columns]
  );

  // Search filter (title)
  const searched = useMemo(
    () => (search ? allTasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase())) : allTasks),
    [allTasks, search]
  );

  // Sort
  const sorted = useMemo(() => {
    const arr = [...searched];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "priority": cmp = (PRIORITY_ORDER[a.priority ?? "medium"]) - (PRIORITY_ORDER[b.priority ?? "medium"]); break;
        case "due_date": cmp = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"); break;
        case "created_at": cmp = (a.created_at ?? "").localeCompare(b.created_at ?? ""); break;
        case "start_date": cmp = ((a as any).start_date ?? "9999").localeCompare((b as any).start_date ?? "9999"); break;
        case "stage": cmp = a._columnName.localeCompare(b._columnName); break;
        case "id": cmp = a.id.localeCompare(b.id); break;
        case "estimated": cmp = (((a as any).estimated_hours ?? 0) - ((b as any).estimated_hours ?? 0)); break;
        case "tracked": cmp = ((a.tracked_hours ?? 0) - (b.tracked_hours ?? 0)); break;
        case "activity": default: cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? ""); cmp = -cmp; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [searched, sortKey, sortDir]);

  // Pagination
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageTasks = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // Ordered visible columns: pinned first
  const orderedCols = useMemo(() => {
    const pinnedSet = new Set(config.pinned);
    const visibleDefs = config.visible
      .map((k) => ALL_COLUMNS.find((c) => c.key === k))
      .filter(Boolean) as ColDef[];
    const pinned = visibleDefs.filter((c) => pinnedSet.has(c.key) || c.fixed);
    const rest = visibleDefs.filter((c) => !pinnedSet.has(c.key) && !c.fixed);
    return [...pinned, ...rest];
  }, [config]);

  function widthOf(c: ColDef) { return config.widths[c.key] ?? c.width; }

  // Left offsets for pinned/sticky columns
  const pinnedKeys = orderedCols.filter((c) => c.fixed || config.pinned.includes(c.key)).map((c) => c.key);
  function leftOffset(key: ColKey): number {
    let off = 40; // checkbox column
    for (const c of orderedCols) {
      if (c.key === key) break;
      if (pinnedKeys.includes(c.key)) off += widthOf(c);
    }
    return off;
  }

  function applyHeaderSort(key: ColKey, dir: "asc" | "desc") {
    setSortKey(key); setSortDir(dir); setHeaderMenu(null);
  }
  function togglePin(key: ColKey) {
    setConfig((c) => ({
      ...c,
      pinned: c.pinned.includes(key) ? c.pinned.filter((k) => k !== key) : [...c.pinned, key],
    }));
    setHeaderMenu(null);
  }
  function hideColumn(key: ColKey) {
    setConfig((c) => ({ ...c, visible: c.visible.filter((k) => k !== key) }));
    setHeaderMenu(null);
  }

  // Column resize
  const resizing = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);
  function onResizeStart(e: React.MouseEvent, c: ColDef) {
    e.preventDefault(); e.stopPropagation();
    resizing.current = { key: c.key, startX: e.clientX, startW: widthOf(c) };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }
  function onResizeMove(e: MouseEvent) {
    const r = resizing.current; if (!r) return;
    const w = Math.max(60, r.startW + (e.clientX - r.startX));
    setConfig((c) => ({ ...c, widths: { ...c.widths, [r.key]: w } }));
  }
  function onResizeEnd() {
    resizing.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }

  // Select-all (this page)
  const pageIds = pageTasks.map((t) => t.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  function toggleSelectAllPage() {
    if (allPageSelected) clearSelection();
    else selectAll(pageIds);
  }

  // CSV export
  function exportCSV() {
    const cols = orderedCols;
    const header = ["", ...cols.map((c) => c.label)];
    const rows = sorted.map((t) => ["", ...cols.map((c) => csvCell(c.key, t))]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tarefas-${boardId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (allTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-neutral-400">Nenhuma tarefa corresponde aos filtros.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-white shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-300" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar por título..."
            className="text-xs border border-neutral-200 rounded-md pl-7 pr-2 py-1.5 w-56 outline-none focus:border-brand-teal"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-[11px] text-neutral-400">Ordenar:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
            className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-brand-teal"
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy"
            title="Inverter ordem"
          >
            {sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </button>
        </div>

        <div className="flex-1" />

        {/* Pagination */}
        <span className="text-xs text-neutral-500">
          {total === 0 ? "0" : `${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, total)}`} de {total}
        </span>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={safePage === 0}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:text-brand-navy"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={safePage >= pageCount - 1}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:text-brand-navy"
        >
          <ChevronRight size={14} />
        </button>

        <button
          onClick={exportCSV}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:text-brand-navy"
          title="Exportar CSV"
        >
          <Download size={13} />
        </button>
        <div className="relative">
          <button
            onClick={() => setConfigOpen((v) => !v)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 hover:text-brand-navy",
              configOpen ? "text-brand-navy bg-neutral-50" : "text-neutral-500"
            )}
            title="Configurar colunas"
          >
            <Settings2 size={13} />
          </button>
          {configOpen && (
            <ColumnConfigPanel
              config={config}
              setConfig={setConfig}
              onClose={() => setConfigOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-left" style={{ minWidth: "100%" }}>
          <thead className="sticky top-0 z-20 bg-white">
            <tr className="border-b border-neutral-100">
              <th
                className="sticky left-0 z-30 bg-white w-10 px-3 py-2.5"
                style={{ width: 40 }}
              >
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllPage}
                  className="w-3.5 h-3.5 rounded accent-brand-teal"
                />
              </th>
              {orderedCols.map((c) => {
                const isPinned = c.fixed || config.pinned.includes(c.key);
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 relative group bg-white",
                      isPinned && "sticky z-20"
                    )}
                    style={{ width: widthOf(c), minWidth: widthOf(c), ...(isPinned ? { left: leftOffset(c.key) } : {}) }}
                  >
                    <button
                      onClick={() => setHeaderMenu((m) => (m === c.key ? null : c.key))}
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium transition-colors max-w-full",
                        sortKey === c.key ? "text-brand-navy" : "text-neutral-500 hover:text-brand-navy"
                      )}
                    >
                      <span className="truncate">{c.label}</span>
                      {sortKey === c.key && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
                      {isPinned && <Pin size={9} className="text-brand-teal" />}
                    </button>

                    {headerMenu === c.key && (
                      <HeaderMenu
                        col={c}
                        pinned={isPinned}
                        onClose={() => setHeaderMenu(null)}
                        onSortAsc={() => applyHeaderSort(c.key, "asc")}
                        onSortDesc={() => applyHeaderSort(c.key, "desc")}
                        onPin={() => togglePin(c.key)}
                        onHide={() => hideColumn(c.key)}
                      />
                    )}

                    {/* Resize handle */}
                    <span
                      onMouseDown={(e) => onResizeStart(e, c)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand-teal/40"
                    />
                  </th>
                );
              })}
              <th className="w-10 px-3 py-2.5 bg-white" />
            </tr>
          </thead>
          <tbody>
            {pageTasks.map((task) => {
              const isSelected = selectedIds.has(task.id);
              return (
                <tr
                  key={task.id}
                  onClick={() => onTaskOpen(task.id)}
                  className={cn(
                    "group cursor-pointer border-b border-neutral-50 transition-colors",
                    isSelected ? "bg-brand-teal/5" : "hover:bg-neutral-50/80"
                  )}
                >
                  <td
                    className={cn("sticky left-0 z-10 w-10 px-3 py-2", isSelected ? "bg-brand-teal/5" : "bg-white group-hover:bg-neutral-50/80")}
                    style={{ width: 40 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTask(task.id)}
                      className="w-3.5 h-3.5 rounded accent-brand-teal"
                    />
                  </td>
                  {orderedCols.map((c) => {
                    const isPinned = c.fixed || config.pinned.includes(c.key);
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2.5 align-middle",
                          isPinned && "sticky z-10",
                          isPinned && (isSelected ? "bg-brand-teal/5" : "bg-white group-hover:bg-neutral-50/80")
                        )}
                        style={{ width: widthOf(c), minWidth: widthOf(c), ...(isPinned ? { left: leftOffset(c.key) } : {}) }}
                      >
                        <CellContent colKey={c.key} task={task} />
                      </td>
                    );
                  })}
                  {/* Row actions menu */}
                  <td className="w-10 px-2 py-2.5 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setRowMenu(rowMenu === task.id ? null : task.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy hover:bg-neutral-100 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {rowMenu === task.id && (
                      <RowMenu
                        task={task}
                        columns={rawColumns}
                        onClose={() => setRowMenu(null)}
                        onOpen={() => { onTaskOpen(task.id); setRowMenu(null); }}
                        onMove={(colId) => moveTaskTo(task.id, colId)}
                        onDuplicate={() => duplicateTask(task)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cell content ────────────────────────────────────────────────────────────

function csvCell(key: ColKey, t: ListTask): string {
  switch (key) {
    case "title": return t.title;
    case "id": return t.id.slice(0, 8).toUpperCase();
    case "stage": return t._columnName;
    case "type": return (t.task_type?.name ?? (t as any).task_type ?? "");
    case "priority": return PRIORITY_LABELS[t.priority ?? "medium"];
    case "due_date": return t.due_date ?? "";
    case "assignees": return assigneeNames(t).join("; ");
    case "created_by": return t.created_by ?? "";
    case "created_at": return t.created_at?.slice(0, 10) ?? "";
    case "start_date": return (t as any).start_date ?? "";
    case "estimated": return String((t as any).estimated_hours ?? "");
    case "tracked": return String(t.tracked_hours ?? 0);
    case "tags": return (t.labels ?? []).map((l: any) => l.name).join("; ");
    case "comments": return String(t._commentCount ?? 0);
    case "attachments": return String(attachmentsCount(t));
    case "project": return t._columnName ? (t.project_id ?? "") : "";
    case "client": return (t as any).client_id ?? "";
    case "area_req": return (t as any).requesting_area ?? t.requesting_area?.name ?? "";
    case "area_reqd": return (t as any).requested_area ?? t.requested_area?.name ?? "";
    case "followers": return "";
    case "desired_start": return (t as any).desired_start_date ?? "";
    case "approval": { const s = approvalStatus(t.id); return s ? APPROVAL_LABELS[s].label : ""; }
    case "checklist": { const cl = t.checklist_items ?? []; return cl.length ? `${cl.filter((i: any) => i.is_done).length}/${cl.length}` : ""; }
    default: return "";
  }
}

function assigneeNames(t: ListTask): string[] {
  const names: string[] = [];
  if (t.assignees?.length) t.assignees.forEach((a: any) => names.push(a.profile?.full_name ?? a.user_id));
  else if (t.assignee?.full_name) names.push(t.assignee.full_name);
  else if (t.assignee_id) names.push(t.assignee_id);
  return names;
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-xs text-neutral-300">—</span>;
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <div className="flex -space-x-1.5 items-center">
      {shown.map((n, i) => (
        <span
          key={i}
          title={n}
          className="w-6 h-6 rounded-full bg-brand-navy/10 text-brand-navy text-[9px] font-bold flex items-center justify-center border-2 border-white"
        >
          {initials(n)}
        </span>
      ))}
      {extra > 0 && (
        <span className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-500 text-[9px] font-bold flex items-center justify-center border-2 border-white">
          +{extra}
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}

function CellContent({ colKey, task }: { colKey: ColKey; task: ListTask }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "delivered";
  const priorityColor = PRIORITY_COLORS[task.priority ?? "medium"];

  switch (colKey) {
    case "title":
      return (
        <div className="flex items-center gap-2">
          <span className="w-1 h-7 rounded-full shrink-0" style={{ background: priorityColor, opacity: 0.7 }} />
          {task.is_urgent && <span className="shrink-0">🚩</span>}
          <span className={cn("text-sm text-neutral-800 font-medium break-words min-w-0", task.status === "delivered" && "line-through text-neutral-400")}>
            {task.title}
          </span>
        </div>
      );
    case "id":
      return <span className="text-xs text-neutral-400 font-mono">#{task.id.slice(0, 6).toUpperCase()}</span>;
    case "stage":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: task._columnColor }} />
          <span className="truncate">{task._columnName}</span>
        </span>
      );
    case "type": {
      const tt = task.task_type?.name ?? (task as any).task_type;
      return tt ? (
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-navy/5 text-brand-navy">{tt}</span>
      ) : <span className="text-xs text-neutral-300">—</span>;
    }
    case "priority":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${priorityColor}18`, color: priorityColor }}>
          {PRIORITY_LABELS[task.priority ?? "medium"]}
        </span>
      );
    case "due_date":
      return task.due_date ? (
        <span className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-neutral-600")}>
          {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          {isOverdue && " ⚠️"}
        </span>
      ) : <span className="text-xs text-neutral-300">—</span>;
    case "assignees":
      return <AvatarStack names={assigneeNames(task)} />;
    case "created_by":
      return <span className="text-xs text-neutral-500">{task.created_by ? initials(task.created_by) : "—"}</span>;
    case "created_at":
      return <span className="text-xs text-neutral-500">{task.created_at ? new Date(task.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}</span>;
    case "start_date":
      return <span className="text-xs text-neutral-500">{(task as any).start_date ? new Date((task as any).start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}</span>;
    case "estimated":
      return <span className="text-xs text-neutral-500">{(task as any).estimated_hours ? `${(task as any).estimated_hours}h` : "—"}</span>;
    case "tracked": {
      const tracked = task.tracked_hours ?? 0;
      const est = (task as any).estimated_hours ?? 0;
      const ratio = est > 0 ? Math.min(tracked / est, 1) : 0;
      const color = ratio < 0.7 ? "#01CFB5" : ratio < 1 ? "#FFB81C" : "#AC145A";
      return (
        <div className="space-y-0.5 min-w-[80px]">
          <span className="text-xs text-neutral-500">{tracked > 0 ? `${Math.floor(tracked)}h${Math.round((tracked % 1) * 60)}m` : "—"}</span>
          {est > 0 && (
            <div className="h-1 rounded-full bg-neutral-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: color }} />
            </div>
          )}
        </div>
      );
    }
    case "tags":
      return (task.labels?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.labels!.slice(0, 3).map((l: any) => (
            <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${l.color}20`, color: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      ) : <span className="text-xs text-neutral-300">—</span>;
    case "comments":
      return (task._commentCount ?? 0) > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-neutral-500"><MessageSquare size={11} /> {task._commentCount}</span>
      ) : <span className="text-xs text-neutral-300">—</span>;
    case "attachments": {
      const n = attachmentsCount(task);
      return n > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-neutral-500"><Paperclip size={11} /> {n}</span>
      ) : <span className="text-xs text-neutral-300">—</span>;
    }
    case "project":
      return <span className="text-xs text-neutral-500 truncate">{task.project_id?.slice(0, 8) ?? "—"}</span>;
    case "client":
      return <span className="text-xs text-neutral-300">—</span>;
    case "area_req":
      return <span className="text-xs text-neutral-500">{(task as any).requesting_area ?? task.requesting_area?.name ?? "—"}</span>;
    case "area_reqd":
      return <span className="text-xs text-neutral-500">{(task as any).requested_area ?? task.requested_area?.name ?? "—"}</span>;
    case "followers":
      return <span className="text-xs text-neutral-300">—</span>;
    case "desired_start":
      return <span className="text-xs text-neutral-500">{(task as any).desired_start_date ? new Date((task as any).desired_start_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}</span>;
    case "approval": {
      const s = approvalStatus(task.id);
      return s ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${APPROVAL_LABELS[s].color}18`, color: APPROVAL_LABELS[s].color }}>{APPROVAL_LABELS[s].label}</span>
      ) : <span className="text-xs text-neutral-300">—</span>;
    }
    case "checklist": {
      const cl = task.checklist_items ?? [];
      if (cl.length === 0) return <span className="text-xs text-neutral-300">—</span>;
      const done = cl.filter((i: any) => i.is_done).length;
      return (
        <div className="flex items-center gap-1.5 min-w-[70px]">
          <span className="text-xs text-neutral-500">{done}/{cl.length}</span>
          <div className="flex-1 h-1 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${(done / cl.length) * 100}%` }} />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

// ── Row actions menu ──────────────────────────────────────────────────────────

function RowMenu({ task, columns, onClose, onOpen, onMove, onDuplicate, onDelete }: {
  task: ListTask;
  columns: { id: string; name: string }[];
  onClose: () => void;
  onOpen: () => void;
  onMove: (colId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [stageOpen, setStageOpen] = useState(false);
  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => window.addEventListener("click", h), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", h); };
  }, [onClose]);

  return (
    <div className="absolute top-full right-0 mt-1 w-44 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 py-1" onClick={(e) => e.stopPropagation()}>
      <MenuItem icon={<MoreHorizontal size={12} />} label="Abrir tarefa" onClick={onOpen} />
      <MenuItem icon={<Settings2 size={12} />} label="Duplicar" onClick={onDuplicate} />
      <div className="relative">
        <button onClick={() => setStageOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 text-left">
          <span className="flex items-center gap-2"><Pin size={12} /> Mover para etapa</span>
          <ChevronRight size={11} />
        </button>
        {stageOpen && (
          <div className="absolute right-full top-0 mr-1 w-40 bg-white rounded-lg border border-neutral-200 shadow-lg py-1 max-h-52 overflow-y-auto">
            {columns.map((c) => (
              <button key={c.id} onClick={() => onMove(c.id)} disabled={c.id === task.column_id}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-30">{c.name}</button>
            ))}
          </div>
        )}
      </div>
      <div className="h-px bg-neutral-100 my-1" />
      <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 text-left">
        <span className="w-3" /> Excluir
      </button>
    </div>
  );
}

// ── Header context menu ────────────────────────────────────────────────────────

function HeaderMenu({
  col, pinned, onClose, onSortAsc, onSortDesc, onPin, onHide,
}: {
  col: ColDef; pinned: boolean; onClose: () => void;
  onSortAsc: () => void; onSortDesc: () => void; onPin: () => void; onHide: () => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => window.addEventListener("click", h), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", h); };
  }, [onClose]);

  return (
    <div
      className="absolute top-full left-0 mt-1 w-44 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      {col.sortable && (
        <>
          <MenuItem icon={<ArrowUp size={12} />} label="Ordenar crescente" onClick={onSortAsc} />
          <MenuItem icon={<ArrowDown size={12} />} label="Ordenar decrescente" onClick={onSortDesc} />
          <div className="h-px bg-neutral-100 my-1" />
        </>
      )}
      <MenuItem icon={<Pin size={12} />} label={pinned ? "Desfixar coluna" : "Fixar coluna"} onClick={onPin} disabled={col.fixed} />
      {!col.fixed && <MenuItem icon={<EyeOff size={12} />} label="Ocultar coluna" onClick={onHide} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors text-left"
    >
      {icon} {label}
    </button>
  );
}

// ── Column config panel ────────────────────────────────────────────────────────

function ColumnConfigPanel({
  config, setConfig, onClose,
}: {
  config: ListConfig; setConfig: React.Dispatch<React.SetStateAction<ListConfig>>; onClose: () => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => window.addEventListener("click", h), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", h); };
  }, [onClose]);

  function toggle(key: ColKey) {
    setConfig((c) => {
      const isVisible = c.visible.includes(key);
      if (isVisible && key === "title") return c; // title always visible
      return {
        ...c,
        visible: isVisible ? c.visible.filter((k) => k !== key) : [...c.visible, key],
      };
    });
  }
  function move(key: ColKey, dir: -1 | 1) {
    setConfig((c) => {
      const idx = c.visible.indexOf(key);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= c.visible.length) return c;
      const v = [...c.visible];
      [v[idx], v[j]] = [v[j], v[idx]];
      return { ...c, visible: v };
    });
  }

  return (
    <div
      className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-neutral-100">
        <span className="text-xs font-semibold text-brand-navy">Colunas visíveis</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={13} /></button>
      </div>
      <div className="max-h-72 overflow-y-auto space-y-0.5">
        {/* Visible (ordered) first */}
        {config.visible.map((key) => {
          const c = ALL_COLUMNS.find((x) => x.key === key)!;
          return (
            <div key={key} className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-neutral-50">
              <GripVertical size={11} className="text-neutral-200" />
              <input type="checkbox" checked onChange={() => toggle(key)} disabled={key === "title"} className="w-3 h-3 accent-brand-teal" />
              <span className="text-xs text-neutral-600 flex-1 truncate">{c.label}</span>
              <button onClick={() => move(key, -1)} className="text-neutral-300 hover:text-brand-navy"><ArrowUp size={11} /></button>
              <button onClick={() => move(key, 1)} className="text-neutral-300 hover:text-brand-navy"><ArrowDown size={11} /></button>
            </div>
          );
        })}
        <div className="h-px bg-neutral-100 my-1" />
        {/* Hidden */}
        {ALL_COLUMNS.filter((c) => !config.visible.includes(c.key)).map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-neutral-50">
            <span className="w-[11px]" />
            <input type="checkbox" checked={false} onChange={() => toggle(c.key)} className="w-3 h-3 accent-brand-teal" />
            <span className="text-xs text-neutral-400 flex-1 truncate">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
