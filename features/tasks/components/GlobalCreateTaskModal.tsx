"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Flag,
  CalendarDays,
  AlignLeft,
  ChevronDown,
  Loader2,
  Plus,
  Paperclip,
  Users,
  Tag,
  CheckSquare,
  GitBranch,
  Repeat,
  UserPlus,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { taskService } from "../services/taskService";
import { tagsService } from "../services/tagsService";
import { attachmentService } from "@/lib/attachmentService";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useBoardStore } from "@/features/board/store/boardStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { createRawClient } from "@/lib/supabase/client";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";
type OverflowCheckResult = null;
import { getInitials } from "@/lib/utils";
import { fetchBoardSubprojects, type BoardProject } from "@/features/board/store/boardProjectStore";
import { taskTypeService } from "@/features/board/services/taskTypeService";
import { runAutomations } from "@/lib/automationEngine";
import { useOrgMembers } from "@/lib/useOrgMembers";
import type { Column } from "@/types";

type Priority = "low" | "medium" | "high" | "urgent";

interface OrgMember { id: string; name: string }
const RECURRENCE_OPTS = [
  { value: "none", label: "Sem repetição" },
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
];
const AVATAR_COLORS = ["#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#F97316", "#06B6D4", "#84CC16"];
function userColor(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function GlobalCreateTaskModal() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  // Subtask mode: when set, the new task is linked to this parent and the board
  // is locked to the parent's board (a subtask always lives in the same board).
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [desiredStartDate, setDesiredStartDate] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  // Single source of truth for all open dropdowns — prevents two from opening at once
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [taskType, setTaskType] = useState("Padrão");

  // Rich action state
  const [boardProjectId, setBoardProjectId] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  // Action UI toggles
  const [showChecklist, setShowChecklist] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [boardTaskTypes, setBoardTaskTypes] = useState<{ id: string; name: string; color: string; default_hours: number }[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<number | null>(null);
  const [overflowWarning, setOverflowWarning] = useState<OverflowCheckResult | null>(null);
  // Roster via cache global compartilhado (fetch único por sessão).
  const orgMembersRaw = useOrgMembers();
  const orgMembers = useMemo<OrgMember[]>(
    () => orgMembersRaw.map((m) => ({ id: m.id, name: m.full_name })),
    [orgMembersRaw]
  );

  const memberName = (id: string) => orgMembers.find((m) => m.id === id)?.name ?? id;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const desiredStartRef = useRef<HTMLInputElement>(null);

  function togglePicker(name: string) {
    setActivePicker((v) => (v === name ? null : name));
  }
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const boardColumns = useBoardStore((s) => s.columns);
  // Sub-projetos do quadro selecionado NO MODAL — estado local, isolado do store
  // global do board (evita vazar projetos entre quadros).
  const [modalBoardProjects, setModalBoardProjects] = useState<BoardProject[]>([]);
  const { user } = useAuthStore();

  // Listen for the global event from TopNav "Nova tarefa" button
  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      // Abre já no quadro que o usuário está vendo (não no 1º da lista) — assim
      // "Nova tarefa" no Marketing Ops começa no Marketing Ops (e seus projetos).
      const currentBoard = useBoardStore.getState().columns[0]?.project_id ?? null;
      setSelectedProjectId(currentBoard ?? projects[0]?.id ?? null);
    }
    window.addEventListener("open-create-task", handleOpen);
    return () => window.removeEventListener("open-create-task", handleOpen);
  }, [projects]);

  // Listen for quick-add from Kanban column — pre-selects project + column
  useEffect(() => {
    function handleOpenInColumn(e: Event) {
      const { projectId, columnId } = (e as CustomEvent<{ projectId: string; columnId: string }>).detail;
      setOpen(true);
      setSelectedProjectId(projectId);
      setSelectedColumnId(columnId);
    }
    window.addEventListener("open-create-task-in-column", handleOpenInColumn);
    return () => window.removeEventListener("open-create-task-in-column", handleOpenInColumn);
  }, []);

  // Listen for "Nova subtarefa" from TaskDetail — locks to the parent's board and
  // links the new task as a subtask (parent_task_id).
  useEffect(() => {
    function handleOpenSubtask(e: Event) {
      const { projectId, columnId, parentTaskId: pid, parentTitle: ptitle, parentSubprojectId } =
        (e as CustomEvent<{ projectId: string; columnId?: string; parentTaskId: string; parentTitle?: string; parentSubprojectId?: string | null }>).detail;
      setOpen(true);
      setSelectedProjectId(projectId);
      if (columnId) setSelectedColumnId(columnId);
      setParentTaskId(pid);
      setParentTitle(ptitle ?? null);
      // Inherit the parent's sub-project so a board that requires one doesn't
      // block the subtask (and it defaults to the parent's project).
      if (parentSubprojectId) setBoardProjectId(parentSubprojectId);
    }
    window.addEventListener("open-create-subtask", handleOpenSubtask);
    return () => window.removeEventListener("open-create-subtask", handleOpenSubtask);
  }, []);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  // Load columns when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setColumns([]);
      setSelectedColumnId(null);
      return;
    }

    // If we have columns in boardStore for this project (currently open board), use them
    if (boardColumns.length > 0) {
      const cols = boardColumns.map((c) => ({
        id: c.id,
        name: c.name,
        project_id: c.project_id,
        position: c.position,
        color: c.color,
      } as Column));
      setColumns(cols);
      if (!selectedColumnId) setSelectedColumnId(cols[0]?.id ?? null);
      return;
    }

    // Otherwise fetch from DB
    setColumnsLoading(true);

    const supabase = createRawClient();
    supabase
      .from("columns")
      .select("id, name, project_id, position, color")
      .eq("project_id", selectedProjectId)
      .order("position")
      .then(({ data, error }) => {
        if (!error && data) {
          setColumns(data as Column[]);
          if (!selectedColumnId) setSelectedColumnId(data[0]?.id ?? null);
        }
        setColumnsLoading(false);
      });
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load board projects when board changes — em estado LOCAL (não no store
  // global), senão os sub-projetos vazam para a view do quadro atual.
  useEffect(() => {
    setBoardProjectId(null);
    if (!selectedProjectId) { setModalBoardProjects([]); return; }
    let cancelled = false;
    const pid = selectedProjectId;
    fetchBoardSubprojects(pid).then((list) => {
      if (!cancelled && pid === selectedProjectId) setModalBoardProjects(list);
    });
    return () => { cancelled = true; };
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load this board's task types from the database. No fallback/auto-seed:
  // the list reflects exactly what exists, so deleted types never resurface.
  useEffect(() => {
    if (!open || !selectedProjectId) {
      setBoardTaskTypes([]);
      return;
    }
    let cancelled = false;
    taskTypeService.list(selectedProjectId).then((types) => {
      if (!cancelled) setBoardTaskTypes(types);
    });
    return () => { cancelled = true; };
  }, [selectedProjectId, open]);

  // Auto-populate estimated hours: user avg (≥15 deliveries) > type default_hours
  useEffect(() => {
    if (!boardTaskTypes.length || !selectedProjectId) {
      setEstimatedHours(null);
      return;
    }
    const match = boardTaskTypes.find((t) => t.name === taskType);
    const defaultHours = match?.default_hours ?? 0;

    // Check history for the assignee (or current user if no assignee)
    const userId = assignees[0] || user?.id || "mock-user";
    const userAvg = 0;

    const resolved = userAvg > 0 ? userAvg : defaultHours > 0 ? defaultHours : null;
    setEstimatedHours(resolved !== null ? Math.round(resolved * 2) / 2 : null); // round to nearest 0.5h
  }, [taskType, boardTaskTypes, assignees, selectedProjectId, user?.id]);

  // No live overflow check in Supabase mode
  useEffect(() => {
    setOverflowWarning(null);
  }, [assignees, desiredStartDate, estimatedHours, selectedProjectId, boardTaskTypes, taskType]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetFields() {
    setTitle("");
    setModalBoardProjects([]);
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setDesiredStartDate("");
    setEstimatedHours(null);
    setOverflowWarning(null);
    setIsUrgent(false);
    setError(null);
    setShowDescription(false);
    setTaskType("Padrão");
    setBoardProjectId(null);
    setAttachmentFiles([]);
    setTags([]);
    setChecklistItems([]);
    setSubtaskTitles([]);
    setAssignees([]);
    setFollowers([]);
    setRecurrence(null);
    setShowChecklist(false);
    setShowSubtasks(false);
    setNewChecklistItem("");
    setNewSubtask("");
    setParentTaskId(null);
    setParentTitle(null);
  }

  function reset() {
    resetFields();
    setActivePicker(null);
  }

  // Tag suggestions = this board's labels (DB). Loaded when a board is chosen.
  useEffect(() => {
    if (!open || !selectedProjectId) { setAllTags([]); return; }
    let cancelled = false;
    tagsService.listForBoard(selectedProjectId).then((labels) => {
      if (!cancelled) setAllTags(labels.map((l) => l.name));
    });
    return () => { cancelled = true; };
  }, [open, selectedProjectId]);

  async function createTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!allTags.includes(trimmed)) setAllTags((prev) => [...prev, trimmed]);
    if (!tags.includes(trimmed)) setTags((t) => [...t, trimmed]);
    setTagSearch("");
    // Persist the label to the board so it's a real suggestion next time.
    if (selectedProjectId) await tagsService.ensureLabel(selectedProjectId, trimmed);
  }

  // Persist the task + all rich fields. Returns created task id or null.
  async function persistTask(): Promise<string | null> {
    const colTasks = boardColumns.find((c) => c.id === selectedColumnId)?.tasks ?? [];
    const lastPos = colTasks.length ? colTasks[colTasks.length - 1].position + 1000 : 1000;

    // Recurrence config (same shape used by TaskDetail + the pg_cron job)
    let recurrenceConfig: Record<string, unknown> | undefined;
    if (recurrence && recurrence !== "none") {
      const d = new Date();
      if (recurrence === "daily") d.setDate(d.getDate() + 1);
      else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
      else if (recurrence === "biweekly") d.setDate(d.getDate() + 14);
      else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
      recurrenceConfig = { frequency: recurrence, until: null, active: true, next_run: d.toISOString().slice(0, 10) };
    }

    const created: any = await taskService.create({
      project_id: selectedProjectId!,
      column_id: selectedColumnId!,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
      desired_start_date: desiredStartDate || undefined,
      estimated_hours: estimatedHours ?? undefined,
      position: lastPos,
      assignee_id: assignees[0] || undefined,
      board_subproject_id: boardProjectId || undefined,
      // Store the type as denormalized text (the field every board screen
      // reads). We intentionally do NOT set type_id: board types live in
      // localStorage with non-UUID ids that would violate the tasks.type_id
      // foreign key.
      task_type: taskType || undefined,
      recurrence_config: recurrenceConfig,
      created_by: user?.id || undefined,
      // Link to the parent when created via "Nova subtarefa".
      parent_task_id: parentTaskId || undefined,
    } as any);
    const taskId: string | undefined = created?.id;
    if (!taskId) return null;

    // is_urgent
    try { await taskService.update(taskId, { is_urgent: isUrgent } as any); } catch (e) { console.error("[createTask] is_urgent update error:", e); }

    // Tags → board labels (ensure the label exists, then attach to the task)
    if (tags.length && selectedProjectId) {
      for (const name of tags) {
        try {
          const label = await tagsService.ensureLabel(selectedProjectId, name);
          if (label) await tagsService.attach(taskId, label.id);
        } catch (e) { console.error("[createTask] tag attach error:", e); }
      }
    }

    // Checklist
    for (let i = 0; i < checklistItems.length; i++) {
      try { await taskService.addChecklistItem(taskId, checklistItems[i], i * 100); } catch (e) { console.error("[createTask] checklist item error:", e); }
    }

    // Attachments → Supabase Storage + task_attachments (via attachmentService)
    if (attachmentFiles.length) {
      const results = await Promise.all(
        attachmentFiles.map((f) => attachmentService.upload(taskId, f).catch(() => null))
      );
      const failed = attachmentFiles.filter((_, i) => !results[i]);
      if (failed.length) {
        try { alert(`${failed.length} anexo(s) não puderam ser enviados: ${failed.map((f) => f.name).join(", ")}`); } catch { /* ignore */ }
      }
    }

    // Dispara automações com gatilho "Tarefa criada".
    runAutomations({ type: "task_created" }, taskId);

    return taskId;
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  const boardProjects = modalBoardProjects;
  const boardProjectRequired = boardProjects.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !selectedProjectId || !selectedColumnId) return;
    if (boardProjectRequired && !boardProjectId) return;
    setError(null);
    setLoading(true);
    try {
      await persistTask();
      handleClose();
      router.push(`/boards/${selectedProjectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tarefa.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAndCreateAnother() {
    if (!title.trim() || !selectedProjectId || !selectedColumnId) return;
    if (boardProjectRequired && !boardProjectId) return;
    setError(null);
    setLoading(true);
    // Preserve the subtask context across "salvar e criar outra" so the next
    // one stays a subtask of the same parent (resetFields clears it otherwise).
    const keepParentId = parentTaskId;
    const keepParentTitle = parentTitle;
    const keepBoard = selectedProjectId;
    const keepColumn = selectedColumnId;
    const keepSubproject = boardProjectId;
    try {
      await persistTask();
      resetFields();
      if (keepParentId) {
        setParentTaskId(keepParentId);
        setParentTitle(keepParentTitle);
        setSelectedProjectId(keepBoard);
        setSelectedColumnId(keepColumn);
        setBoardProjectId(keepSubproject);
      }
      setTimeout(() => titleRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tarefa.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedColumn = columns.find((c) => c.id === selectedColumnId);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: "90vw", maxWidth: "1100px", height: "88vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
            {/* Project selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { if (!parentTaskId) togglePicker("project"); }}
                disabled={!!parentTaskId}
                title={parentTaskId ? "Subtarefas são criadas sempre no quadro atual" : undefined}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 text-sm font-medium text-neutral-700 transition-colors",
                  parentTaskId ? "opacity-70 cursor-not-allowed" : "hover:bg-neutral-200"
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background:
                      selectedProject?.color ?? "#407EC9",
                  }}
                />
                <span className="max-w-[140px] truncate">
                  {selectedProject?.name ?? "Selecionar quadro"}
                </span>
                {!parentTaskId && <ChevronDown size={12} />}
              </button>

              {!parentTaskId && activePicker === "project" && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10 max-h-52 overflow-y-auto">
                  {projects.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-neutral-400">
                      Nenhum quadro disponível
                    </p>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setSelectedColumnId(null);
                          setActivePicker(null);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors",
                          selectedProjectId === p.id
                            ? "text-brand-navy font-medium"
                            : "text-neutral-700"
                        )}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: p.color ?? "#407EC9" }}
                        />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Subtask indicator */}
            {parentTaskId && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-teal/10 text-brand-teal text-xs font-medium max-w-[220px]">
                <GitBranch size={12} className="shrink-0" />
                <span className="truncate">Subtarefa de: {parentTitle ?? "tarefa atual"}</span>
              </span>
            )}

            {/* Column/Stage selector */}
            {selectedProjectId && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePicker("column")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-sm text-neutral-600 transition-colors"
                >
                  {columnsLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>
                      <span className="max-w-[120px] truncate">
                        {selectedColumn?.name ?? "Selecionar etapa"}
                      </span>
                      <ChevronDown size={12} />
                    </>
                  )}
                </button>

                {activePicker === "column" && (
                  <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10 max-h-48 overflow-y-auto">
                    {columns.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          setSelectedColumnId(col.id);
                          setActivePicker(null);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors",
                          selectedColumnId === col.id
                            ? "text-brand-navy font-medium"
                            : "text-neutral-700"
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: col.color ?? "#A0A4A8" }}
                        />
                        {col.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1" />

            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Form: scrollable body + fixed footer */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Title input */}
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da tarefa..."
              maxLength={200}
              className="w-full text-lg font-medium text-neutral-900 placeholder:text-neutral-300 outline-none py-2 border-b border-neutral-100 focus:border-brand-teal transition-colors"
              required
            />

            {/* Description (collapsible) */}
            {showDescription ? (
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicionar descrição..."
                rows={3}
                className="w-full mt-3 text-sm text-neutral-600 placeholder:text-neutral-300 outline-none resize-none border border-neutral-200 rounded-lg p-2.5 focus:border-brand-teal transition-colors"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                className="mt-2 flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <AlignLeft size={13} />
                Adicionar descrição
              </button>
            )}

            {/* Projeto (board project) — required when projects exist */}
            {boardProjectRequired && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
                  Projeto <span className="text-destructive">*</span>
                </label>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => togglePicker("boardProject")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors",
                      boardProjectId
                        ? "border-brand-teal/40 bg-brand-teal/5 text-brand-navy font-medium"
                        : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:border-neutral-300"
                    )}
                  >
                    {boardProjectId ? (
                      <>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: boardProjects.find((b) => b.id === boardProjectId)?.color }}
                        />
                        <span className="max-w-[200px] truncate">
                          {boardProjects.find((b) => b.id === boardProjectId)?.name}
                        </span>
                      </>
                    ) : (
                      <span>Selecionar projeto...</span>
                    )}
                    <ChevronDown size={12} className="shrink-0" />
                  </button>

                  {activePicker === "boardProject" && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-20 max-h-52 overflow-y-auto">
                      {boardProjects.map((bp) => (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => {
                            setBoardProjectId(bp.id === boardProjectId ? null : bp.id);
                            setActivePicker(null);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors",
                            boardProjectId === bp.id ? "text-brand-navy font-medium" : "text-neutral-700"
                          )}
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: bp.color }} />
                          <span className="truncate">{bp.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!boardProjectId && (
                  <p className="mt-1.5 text-[11px] text-destructive">Selecione um projeto para continuar.</p>
                )}
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {/* Priority */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePicker("priority")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: `${PRIORITY_COLORS[priority]}18`,
                    color: PRIORITY_COLORS[priority],
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: PRIORITY_COLORS[priority] }}
                  />
                  {PRIORITY_LABELS[priority]}
                  <ChevronDown size={11} />
                </button>

                {activePicker === "priority" && (
                  <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10">
                    {(
                      Object.entries(PRIORITY_LABELS) as [Priority, string][]
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setPriority(val);
                          setActivePicker(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: PRIORITY_COLORS[val] }}
                        />
                        <span style={{ color: PRIORITY_COLORS[val] }}>
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Due date — uses showPicker() to reliably open native calendar */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { try { dueDateRef.current?.showPicker(); } catch { dueDateRef.current?.click(); } }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-500 bg-neutral-100 hover:bg-neutral-200 cursor-pointer transition-colors"
                >
                  <CalendarDays size={13} />
                  {dueDate ? (
                    <span className="font-medium text-brand-navy">
                      {new Date(dueDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </span>
                  ) : "Data limite"}
                  {dueDate && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setDueDate(""); }}
                      className="ml-0.5 text-neutral-300 hover:text-neutral-600 leading-none"
                    >×</span>
                  )}
                </button>
                <input
                  ref={dueDateRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  tabIndex={-1}
                  className="absolute opacity-0 pointer-events-none"
                  style={{ top: "100%", left: 0, width: "1px", height: "1px" }}
                />
              </div>

              {/* Desired start date — required for capacity overflow check */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { try { desiredStartRef.current?.showPicker(); } catch { desiredStartRef.current?.click(); } }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors",
                    desiredStartDate
                      ? "bg-brand-teal/10 text-brand-teal font-medium hover:bg-brand-teal/20"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  )}
                >
                  <Clock size={13} />
                  {desiredStartDate ? (
                    <>
                      {new Date(desiredStartDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setDesiredStartDate(""); }}
                        className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
                      >×</span>
                    </>
                  ) : (
                    <>Início desejado</>
                  )}
                </button>
                <input
                  ref={desiredStartRef}
                  type="date"
                  value={desiredStartDate}
                  onChange={(e) => setDesiredStartDate(e.target.value)}
                  tabIndex={-1}
                  className="absolute opacity-0 pointer-events-none"
                  style={{ top: "100%", left: 0, width: "1px", height: "1px" }}
                />
              </div>

              {/* Urgency toggle */}
              <button
                type="button"
                onClick={() => setIsUrgent((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors",
                  isUrgent
                    ? "bg-destructive/10 text-destructive font-medium"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                )}
              >
                <Flag size={12} className={isUrgent ? "fill-current" : ""} />
                {isUrgent ? "Urgente" : "Urgência"}
              </button>

              {/* Task Type */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => togglePicker("taskType")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs text-neutral-600 transition-colors"
                >
                  <Tag size={11} />
                  {taskType}
                  <ChevronDown size={10} />
                </button>
                {activePicker === "taskType" && (
                  <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10">
                    {boardTaskTypes.map((t) => t.name).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTaskType(t); setActivePicker(null); }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-50 transition-colors",
                          taskType === t ? "font-medium text-brand-navy" : "text-neutral-600"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                    {/* Create a new type inline — persists to this board's types */}
                    <div className="border-t border-neutral-100 mt-1 pt-1 px-2 pb-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={newTypeName}
                          onChange={(e) => setNewTypeName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const name = newTypeName.trim();
                              if (!name || !selectedProjectId) return;
                              setNewTypeName("");
                              setActivePicker(null);
                              setTaskType(name);
                              const created = await taskTypeService.create(selectedProjectId, { name });
                              if (created) setBoardTaskTypes((prev) => prev.some((t) => t.name === created.name) ? prev : [...prev, created]);
                            }
                          }}
                          placeholder="Novo tipo…"
                          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-neutral-200 outline-none focus:border-brand-teal"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const name = newTypeName.trim();
                            if (!name || !selectedProjectId) return;
                            setNewTypeName("");
                            setActivePicker(null);
                            setTaskType(name);
                            const created = await taskTypeService.create(selectedProjectId, { name });
                            if (created) setBoardTaskTypes((prev) => prev.some((t) => t.name === created.name) ? prev : [...prev, created]);
                          }}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 transition-colors"
                          title="Criar tipo"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Estimated hours — auto-set from type default_hours, user can override */}
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 text-xs text-neutral-500">
                <Clock size={11} />
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={estimatedHours ?? ""}
                  onChange={(e) => setEstimatedHours(e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0h"
                  className="w-10 bg-transparent outline-none text-neutral-700 font-medium"
                />
                <span>h est.</span>
              </div>
            </div>

            {/* Selected chips: assignees / tags / followers / attachments */}
            {(assignees.length > 0 || tags.length > 0 || followers.length > 0 || recurrence) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {assignees.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-400">Alocados:</span>
                    <span className="flex -space-x-1">
                      {assignees.map((id) => (
                        <span key={id} title={memberName(id)} className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white" style={{ background: userColor(memberName(id)) }}>
                          {getInitials(memberName(id))}
                        </span>
                      ))}
                    </span>
                  </span>
                )}
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 text-[10px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full">
                    {t}<button type="button" onClick={() => setTags((x) => x.filter((y) => y !== t))}>×</button>
                  </span>
                ))}
                {followers.length > 0 && <span className="text-[10px] text-neutral-400">👁 {followers.length} seguidor(es)</span>}
                {recurrence && recurrence !== "none" && (
                  <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">
                    🔁 {RECURRENCE_OPTS.find((r) => r.value === recurrence)?.label}
                  </span>
                )}
              </div>
            )}

            {/* Attachment chips */}
            {attachmentFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attachmentFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] bg-neutral-100 rounded px-2 py-1 text-neutral-600">
                    <Paperclip size={10} /><span className="max-w-[120px] truncate">{f.name}</span>
                    <button type="button" onClick={() => setAttachmentFiles((a) => a.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Expandable: Checklist */}
            {showChecklist && (
              <div className="border border-neutral-200 rounded-lg p-3 mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Checklist</p>
                {checklistItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled className="accent-brand-teal" />
                    <span className="flex-1">{item}</span>
                    <button type="button" onClick={() => setChecklistItems((c) => c.filter((_, j) => j !== i))} className="text-neutral-300 hover:text-destructive text-xs">×</button>
                  </div>
                ))}
                <input
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newChecklistItem.trim()) { e.preventDefault(); setChecklistItems((c) => [...c, newChecklistItem.trim()]); setNewChecklistItem(""); } }}
                  placeholder="Adicionar item + Enter..."
                  className="w-full text-sm border border-neutral-200 rounded px-2 py-1 outline-none focus:border-brand-teal"
                />
              </div>
            )}

            {/* Expandable: Subtasks */}
            {showSubtasks && (
              <div className="border border-neutral-200 rounded-lg p-3 mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Subtarefas</p>
                {subtaskTitles.map((st, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-400">↳</span>
                    <span className="flex-1">{st}</span>
                    <button type="button" onClick={() => setSubtaskTitles((s) => s.filter((_, j) => j !== i))} className="text-neutral-300 hover:text-destructive text-xs">×</button>
                  </div>
                ))}
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newSubtask.trim()) { e.preventDefault(); setSubtaskTitles((s) => [...s, newSubtask.trim()]); setNewSubtask(""); } }}
                  placeholder="Título da subtarefa + Enter..."
                  className="w-full text-sm border border-neutral-200 rounded px-2 py-1 outline-none focus:border-brand-teal"
                />
              </div>
            )}

            {/* Quick action toolbar */}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t border-neutral-100 flex-wrap">
              <span className="text-xs text-neutral-400 mr-1">Adicionar:</span>

              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); setAttachmentFiles((a) => [...a, ...fs]); e.target.value = ""; }} />

              {/* Anexo */}
              <ToolbarBtn icon={Paperclip} label="Anexo" onClick={() => fileInputRef.current?.click()} />

              {/* Tags */}
              <div className="relative">
                <ToolbarBtn icon={Tag} label="Tags" active={tags.length > 0} onClick={() => togglePicker("tags")} />
                {activePicker === "tags" && (
                  <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-xl shadow-xl border border-neutral-100 p-2 z-20">
                    <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Buscar ou criar tag..."
                      onKeyDown={(e) => { if (e.key === "Enter" && tagSearch.trim()) { e.preventDefault(); createTag(tagSearch.trim()); } }}
                      className="w-full text-xs border border-neutral-200 rounded px-2 py-1.5 outline-none focus:border-brand-teal mb-1.5" />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {allTags.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase())).map((t) => (
                        <label key={t} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-50 cursor-pointer">
                          <input type="checkbox" checked={tags.includes(t)} onChange={() => setTags((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} className="w-3 h-3 accent-brand-teal" />
                          <span className="text-xs text-neutral-600">{t}</span>
                        </label>
                      ))}
                      {tagSearch.trim() && !allTags.some((t) => t.toLowerCase() === tagSearch.toLowerCase()) && (
                        <button type="button" onClick={() => createTag(tagSearch.trim())} className="w-full text-left text-xs text-brand-teal hover:bg-brand-teal/5 px-1 py-1 rounded">+ Criar tag “{tagSearch.trim()}”</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist toggle */}
              <ToolbarBtn icon={CheckSquare} label="Checklist" active={showChecklist} onClick={() => setShowChecklist((v) => !v)} />

              {/* Subtasks toggle */}
              <ToolbarBtn icon={GitBranch} label="Subtarefas" active={showSubtasks} onClick={() => setShowSubtasks((v) => !v)} />

              {/* Alocados */}
              <div className="relative">
                <ToolbarBtn icon={Users} label="Alocados" active={assignees.length > 0} border onClick={() => togglePicker("assignees")} />
                {activePicker === "assignees" && <UserPickerDropdown members={orgMembers} selected={assignees} onToggle={(id) => setAssignees((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])} />}
              </div>

              {/* Repetição */}
              <div className="relative">
                <button type="button" title="Repetição" onClick={() => togglePicker("recurrence")}
                  className={cn("w-7 h-7 flex items-center justify-center rounded-md transition-colors", recurrence && recurrence !== "none" ? "text-brand-teal bg-brand-teal/10" : "text-neutral-400 hover:text-brand-navy hover:bg-neutral-100")}>
                  <Repeat size={14} />
                </button>
                {activePicker === "recurrence" && (
                  <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-20">
                    {RECURRENCE_OPTS.map((r) => (
                      <button key={r.value} type="button" onClick={() => { setRecurrence(r.value); setActivePicker(null); }}
                        className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-50", recurrence === r.value ? "text-brand-navy font-medium" : "text-neutral-600")}>{r.label}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Seguidores */}
              <div className="relative">
                <button type="button" title="Seguidores" onClick={() => togglePicker("followers")}
                  className={cn("w-7 h-7 flex items-center justify-center rounded-md transition-colors", followers.length > 0 ? "text-brand-teal bg-brand-teal/10" : "text-neutral-400 hover:text-brand-navy hover:bg-neutral-100")}>
                  <UserPlus size={14} />
                </button>
                {activePicker === "followers" && <UserPickerDropdown members={orgMembers} selected={followers} onToggle={(id) => setFollowers((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])} />}
              </div>
            </div>


            {/* Error */}
            {error && (
              <p className="mt-3 text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
            </div>

            {/* Submit footer (fixed) */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-neutral-100 bg-white flex-wrap">
              <p className="text-xs text-neutral-400">
                {!selectedProject
                  ? "Selecione um quadro para continuar"
                  : `em ${selectedProject.name}${selectedColumn ? ` › ${selectedColumn.name}` : ""}`}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-1.5 rounded-lg text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAndCreateAnother}
                  disabled={!title.trim() || !selectedProjectId || !selectedColumnId || (boardProjectRequired && !boardProjectId) || loading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
                >
                  Salvar e criar outra
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !title.trim() ||
                    !selectedProjectId ||
                    !selectedColumnId ||
                    (boardProjectRequired && !boardProjectId)
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                    "bg-brand-navy text-white hover:bg-brand-navy/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  Criar tarefa
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolbarBtn({ icon: Icon, label, onClick, active, border }: {
  icon: React.ElementType; label: string; onClick?: () => void; active?: boolean; border?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
        active ? "bg-brand-teal/10 text-brand-teal" : "text-neutral-400 hover:text-brand-navy hover:bg-neutral-100",
        border && "border border-dashed border-neutral-200"
      )}
    >
      <Icon size={12} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function UserPickerDropdown({ members, selected, onToggle }: { members: OrgMember[]; selected: string[]; onToggle: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 p-2 z-20" onClick={(e) => e.stopPropagation()}>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar membro..."
        className="w-full text-xs border border-neutral-200 rounded px-2 py-1.5 outline-none focus:border-brand-teal mb-1.5" />
      <div className="max-h-44 overflow-y-auto space-y-0.5">
        {members.length === 0 && <p className="text-[11px] text-neutral-400 px-1 py-1">Carregando membros...</p>}
        {filtered.map((u) => (
          <label key={u.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => onToggle(u.id)} className="w-3 h-3 accent-brand-teal" />
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: userColor(u.name) }}>
              {getInitials(u.name)}
            </span>
            <span className="text-xs text-neutral-600">{u.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
