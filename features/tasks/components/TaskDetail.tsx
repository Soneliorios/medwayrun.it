"use client";
// v2

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Play,
  Square,
  Check,
  CheckCircle2,
  Flag,
  Plus,
  Trash2,
  Loader2,
  MoreHorizontal,
  Clock,
  MessageSquare,
  ListChecks,
  FileText,
  Zap,
  Users,
  ClipboardCheck,
  Paperclip,
  Mail,
  UserPlus,
  Tag as TagIcon,
  Repeat,
  X,
  FileIcon,
  AlertCircle,
  GitBranch,
  Link2,
  ArrowRight,
  Layers,
  Download,
  Eye,
  Pencil,
} from "lucide-react";
import { cn, formatDate, formatDateFull, isOverdue, formatHours } from "@/lib/utils";
import { PRIORITY_LABELS, PRIORITY_COLORS, formatElapsed } from "@/types";
import { taskService } from "../services/taskService";
import { useBoardStore } from "@/features/board/store/boardStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { CommentList } from "./CommentList";
import { RichTextEditor } from "./RichTextEditor";
import { RulesTab } from "./RulesTab";
import { ApprovalBanner } from "./ApprovalControls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { useRole } from "@/features/auth/hooks/useRole";
import { useBoardProjectStore } from "@/features/board/store/boardProjectStore";
import { createClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import type { TaskWithRelations } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type DetailTab = "description" | "comments" | "checklist" | "subtasks" | "stage" | "attachments" | "emails" | "rules";

const TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: "description", label: "Descrição", icon: FileText },
  { id: "comments", label: "Comentários", icon: MessageSquare },
  { id: "checklist", label: "Checklist", icon: ListChecks },
  { id: "subtasks", label: "Subtarefas", icon: GitBranch },
  { id: "stage", label: "Req. Etapa", icon: ClipboardCheck },
  { id: "attachments", label: "Anexos", icon: Paperclip },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "rules", label: "Regras", icon: Zap },
];

const TASK_TYPES = ["Padrão", "Bug", "Feature", "Melhoria", "Análise"] as const;
const AREAS = ["TI", "Marketing", "Comercial", "RH", "Financeiro", "Produto"] as const;
const RECURRENCE_OPTIONS = [
  { value: "none", label: "Sem repetição" },
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
] as const;

interface MockAttachment {
  id: string;
  name: string;
  size: number;
  addedAt: string;
  mimeType?: string;
  dataUrl?: string; // base64 data URL for preview/download (files ≤ 5 MB)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024; // 5 MB cap for localStorage

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFileCategory(mimeType?: string): "image" | "pdf" | "video" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function getFileExtColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "#EF4444", doc: "#2563EB", docx: "#2563EB",
    xls: "#16A34A", xlsx: "#16A34A", csv: "#16A34A",
    ppt: "#EA580C", pptx: "#EA580C",
    zip: "#7C3AED", rar: "#7C3AED",
    mp4: "#0891B2", mov: "#0891B2",
    jpg: "#D97706", jpeg: "#D97706", png: "#D97706", gif: "#D97706", webp: "#D97706",
  };
  return map[ext] ?? "#64748B";
}

function getAttachmentsKey(taskId: string) {
  return `mwr_attachments_${taskId}`;
}

function loadAttachments(taskId: string): MockAttachment[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(getAttachmentsKey(taskId)) ?? "[]");
  } catch {
    return [];
  }
}

function saveAttachments(taskId: string, attachments: MockAttachment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getAttachmentsKey(taskId), JSON.stringify(attachments));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  taskId: string;
  onClose: () => void;
  variant?: "modal" | "page";
}


export function TaskDetail({ taskId, onClose, variant = "modal" }: Props) {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newTagInput, setNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<MockAttachment | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [headerAssigneeOpen, setHeaderAssigneeOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  // deliverySeconds stores total time in seconds for the popup (tracked + running timer)
  const [deliverySeconds, setDeliverySeconds] = useState<number>(0);
  const [deliveryH, setDeliveryH] = useState<string>("0");
  const [deliveryM, setDeliveryM] = useState<string>("00");
  const [deliveryS, setDeliveryS] = useState<string>("00");
  const [deliveryLink, setDeliveryLink] = useState<string>("");
  const [deliveryNote, setDeliveryNote] = useState<string>("");
  const [editingTrackedHours, setEditingTrackedHours] = useState(false);
  const [trackedHoursInput, setTrackedHoursInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const headerAssigneeRef = useRef<HTMLDivElement>(null);

  const store = useBoardStore();
  const { user } = useAuthStore();
  const { isUser, isAdmin } = useRole();
  const timerStore = useTimerStore();
  const projectStore = useProjectStore();
  const boardColumns = useBoardStore((s) => s.columns);
  const boardProjectStore = useBoardProjectStore();
  const subtasks = useMemo(
    () => boardColumns.flatMap((c) => c.tasks).filter((t: any) => t.parent_task_id === taskId),
    [boardColumns, taskId]
  );

  const isTimerActive = timerStore.activeTaskId === taskId;
  const elapsed = timerStore.getElapsedForTask(taskId);

  const [orgProfiles, setOrgProfiles] = useState<Array<{ id: string; full_name: string | null; avatar_url: string | null }>>([]);
  useEffect(() => {
    async function loadOrgProfiles() {
      // Primary: service-role endpoint accessible to any org member (bypasses
      // profiles RLS that would otherwise hide everyone but the current user).
      try {
        const res = await fetch("/api/org/members");
        if (res.ok) {
          const members = (await res.json()) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>;
          if (Array.isArray(members) && members.length > 0) {
            setOrgProfiles(members.map((m) => ({ id: m.id, full_name: m.full_name, avatar_url: m.avatar_url })));
            return;
          }
        }
      } catch { /* fall through */ }
      // Fallback: direct query
      const sb = createClient();
      const { data } = await sb
        .from("members")
        .select("user_id, profiles!inner(id, full_name, avatar_url)")
        .eq("org_id", ORG_ID);
      setOrgProfiles((data ?? []).map((m: any) => m.profiles));
    }
    loadOrgProfiles();
  }, []);

  // Load task
  useEffect(() => {
    setLoading(true);
    taskService.get(taskId).then((t) => {
      setTask(t);
      setLoading(false);
      if (t?.project_id) boardProjectStore.load(t.project_id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Load attachments
  useEffect(() => {
    setAttachments(loadAttachments(taskId));
  }, [taskId]);

  // Close assignee picker on outside click
  useEffect(() => {
    if (!assigneePickerOpen) return;
    function handleOutside(e: MouseEvent) {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setAssigneePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [assigneePickerOpen]);

  // Close header assignee picker on outside click
  useEffect(() => {
    if (!headerAssigneeOpen) return;
    function handleOutside(e: MouseEvent) {
      if (headerAssigneeRef.current && !headerAssigneeRef.current.contains(e.target as Node)) {
        setHeaderAssigneeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [headerAssigneeOpen]);

  // Record recent view (for header history)
  useEffect(() => {
    if (!task || typeof window === "undefined") return;
    try {
      const boardName = projectStore.projects.find((p) => p.id === task.project_id)?.name ?? "Quadro";
      const prev = JSON.parse(localStorage.getItem("mwr_recent_views") ?? "[]") as any[];
      const next = [{ id: taskId, title: task.title, board: boardName, viewed_at: new Date().toISOString() },
        ...prev.filter((r) => r.id !== taskId)].slice(0, 10);
      localStorage.setItem("mwr_recent_views", JSON.stringify(next));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Derived project name
  const projectName = task?.project_id
    ? (projectStore.projects.find((p) => p.id === task.project_id)?.name ?? "—")
    : "—";

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleFieldUpdate(field: string, value: string | null) {
    if (!task) return;
    const snapshot = task;
    setTask((prev) => prev ? { ...prev, [field]: value } as TaskWithRelations : null);
    store.updateTask(taskId, { [field]: value } as any);
    await taskService.update(taskId, { [field]: value } as any).catch(() => {
      setTask(snapshot);
      store.updateTask(taskId, { [field]: (snapshot as any)[field] } as any);
    });
  }

  async function handleToggleTimer() {
    if (!user?.id) return;
    if (isTimerActive) {
      await timerStore.stopTimer(user.id);
    } else {
      if (!(task as any)?.start_date) {
        await handleFieldUpdate("start_date", new Date().toISOString().split("T")[0]);
      }
      await timerStore.startTimer(user.id, taskId);
    }
  }

  function parseTimeInput(input: string): number | null {
    const trimmed = input.trim().replace(",", ".");
    const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (colonMatch) {
      const h = parseInt(colonMatch[1], 10);
      const m = parseInt(colonMatch[2], 10);
      if (m < 60) return h + m / 60;
    }
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num >= 0) return num;
    return null;
  }

  async function handleTrackedHoursUpdate(hours: number) {
    if (!task) return;
    const rounded = Math.round(hours * 100) / 100;
    setTask((t) => t ? { ...t, tracked_hours: rounded } : t);
    store.updateTask(taskId, { tracked_hours: rounded } as any);
    await taskService.update(taskId, { tracked_hours: rounded } as any).catch(() => {
      setTask(task);
      store.updateTask(taskId, { tracked_hours: task.tracked_hours } as any);
    });
  }

  function commitTrackedHoursEdit() {
    const parsed = parseTimeInput(trackedHoursInput);
    if (parsed !== null) handleTrackedHoursUpdate(parsed);
    setEditingTrackedHours(false);
  }

  async function handleDeliver(opts?: { hours?: number; link?: string; note?: string }) {
    if (!task) return;
    if (isDelivered) return;

    await handleFieldUpdate("status", "delivered");

    // Move to the last column ("Concluído")
    const sorted = [...boardColumns].sort((a, b) => a.position - b.position);
    const lastCol = sorted[sorted.length - 1];
    if (lastCol && lastCol.id !== task.column_id) {
      const pos = (task as any).position ?? 1000;
      setTask((t) => (t ? { ...t, column_id: lastCol.id } : t));
      store.moveTask(taskId, lastCol.id, pos);
      taskService.update(taskId, { column_id: lastCol.id } as any).catch(() => {});
    }

  }

  async function handleReopen() {
    if (!task) return;
    await handleFieldUpdate("status", "open");

    const sorted = [...boardColumns].sort((a, b) => a.position - b.position);
    const targetCol =
      sorted.find((c) => c.name.toLowerCase().includes("revis")) ??
      sorted[Math.max(sorted.length - 2, 0)];

    if (targetCol && targetCol.id !== task.column_id) {
      const pos = (task as any).position ?? 1000;
      setTask((t) => (t ? { ...t, column_id: targetCol.id } : t));
      store.moveTask(taskId, targetCol.id, pos);
      taskService.update(taskId, { column_id: targetCol.id } as any).catch(() => {});
    }
  }

  async function handleDeleteTask() {
    store.removeTask(taskId);
    await taskService.delete(taskId);
    setDeleteConfirm(false);
    onClose();
  }

  async function handleAddChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !newChecklistItem.trim()) return;
    const position = (task.checklist_items?.length ?? 0) * 100;
    const item = await taskService.addChecklistItem(taskId, newChecklistItem.trim(), position);
    setTask((t) => t ? { ...t, checklist_items: [...(t.checklist_items ?? []), item as any] } : t);
    setNewChecklistItem("");
  }

  async function handleChecklistToggle(itemId: string, isDone: boolean) {
    setTask((t) =>
      t ? { ...t, checklist_items: t.checklist_items?.map((i) => i.id === itemId ? { ...i, is_done: isDone } : i) } : t
    );
    await taskService.updateChecklist(itemId, isDone);
  }

  async function handleDeleteChecklistItem(itemId: string) {
    setTask((t) => t ? { ...t, checklist_items: t.checklist_items?.filter((i) => i.id !== itemId) } : t);
    await taskService.deleteChecklistItem(itemId);
  }

  async function handleFilesAdded(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newAttachments: MockAttachment[] = await Promise.all(
      Array.from(files).map(async (f) => {
        let dataUrl: string | undefined;
        if (f.size <= MAX_PREVIEW_BYTES) {
          try { dataUrl = await readFileAsDataUrl(f); } catch {}
        }
        return {
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          mimeType: f.type || undefined,
          addedAt: new Date().toISOString(),
          dataUrl,
        };
      })
    );
    const updated = [...attachments, ...newAttachments];
    setAttachments(updated);
    saveAttachments(taskId, updated);
  }

  function handleDeleteAttachment(id: string) {
    const updated = attachments.filter((a) => a.id !== id);
    setAttachments(updated);
    saveAttachments(taskId, updated);
  }

  function handleAddTag() {
    if (!task || !newTagValue.trim()) {
      setNewTagInput(false);
      setNewTagValue("");
      return;
    }
    // For mock: add a label locally
    const fakeLabel = {
      id: crypto.randomUUID(),
      name: newTagValue.trim(),
      color: "#01CFB5",
      task_id: taskId,
      created_at: new Date().toISOString(),
    } as any;
    setTask((t) => t ? { ...t, labels: [...(t.labels ?? []), fakeLabel] } : t);
    setNewTagInput(false);
    setNewTagValue("");
  }

  async function handleAssigneeChange(newUserId: string | null) {
    if (!task) return;
    await handleFieldUpdate("assignee_id", newUserId);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const checklist = task?.checklist_items ?? [];
  const doneCount = checklist.filter((i) => i.is_done).length;

  // A task is only "delivered" when its status field is delivered AND it sits in
  // the last column of the board. Dragging a card back to an earlier stage should
  // automatically make it re-deliverable (the delivered badge disappears).
  const lastColumnId = useMemo(() => {
    if (!boardColumns.length) return null;
    return [...boardColumns].sort((a, b) => a.position - b.position).at(-1)?.id ?? null;
  }, [boardColumns]);
  const isDelivered =
    (task as any)?.status === "delivered" &&
    (!lastColumnId || task?.column_id === lastColumnId);
  const overdue = isOverdue(task?.due_date);
  const estimatedHours: number = (task as any)?.estimated_hours ?? 0;
  const trackedHours: number = task?.tracked_hours ?? 0;
  const timeRatio = estimatedHours > 0 ? trackedHours / estimatedHours : 0;
  const timeBarColor = timeRatio < 0.7 ? "#01CFB5" : timeRatio <= 1 ? "#FFB81C" : "#AC145A";

  // Role-based action gating
  const isAssignee = task?.assignee_id === user?.id;
  const canActOnTask = !isUser || !!isAssignee;

  // ── Render ─────────────────────────────────────────────────────────────────

  const isPage = variant === "page";

  return (
    <div
      className={cn(
        isPage
          ? "h-full w-full bg-white"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      )}
      onClick={isPage ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          "bg-white flex flex-col overflow-hidden",
          isPage ? "w-full h-full" : "rounded-2xl shadow-2xl"
        )}
        style={isPage ? undefined : { width: '90vw', maxWidth: '1280px', height: '88vh' }}
        onClick={isPage ? undefined : (e) => e.stopPropagation()}
      >
        {loading || !task ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 shrink-0">
              {/* Timer button */}
              <button
                onClick={handleToggleTimer}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  isTimerActive
                    ? "bg-brand-teal text-white"
                    : "border border-neutral-200 text-neutral-600 hover:border-brand-teal hover:text-brand-teal"
                )}
              >
                {isTimerActive ? <Square size={12} /> : <Play size={12} />}
                {isTimerActive
                  ? formatElapsed(elapsed)
                  : formatHours(task.tracked_hours ?? 0)}
              </button>

              {/* Deliver / Reopen button */}
              {isDelivered ? (
                <button
                  onClick={canActOnTask ? handleReopen : undefined}
                  title={canActOnTask ? "Clique para reabrir a tarefa" : "Somente o responsável pode reabrir"}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                    canActOnTask
                      ? "bg-green-100 text-green-700 border-green-200 hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300"
                      : "bg-green-50 text-green-300 border-green-100 cursor-not-allowed"
                  )}
                >
                  <CheckCircle2 size={12} />
                  Entregue · Reabrir
                </button>
              ) : (
                <button
                  onClick={canActOnTask ? () => {
                    const totalSec = Math.round((task.tracked_hours ?? 0) * 3600) + elapsed;
                    const h = Math.floor(totalSec / 3600);
                    const m = Math.floor((totalSec % 3600) / 60);
                    const s = totalSec % 60;
                    setDeliverySeconds(totalSec);
                    setDeliveryH(String(h));
                    setDeliveryM(String(m).padStart(2, "0"));
                    setDeliveryS(String(s).padStart(2, "0"));
                    setDeliveryLink((task as any).delivery_link ?? "");
                    setDeliveryNote((task as any).delivery_note ?? "");
                    setDeliveryDialogOpen(true);
                  } : undefined}
                  title={!canActOnTask ? "Somente o responsável pode entregar" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                    canActOnTask
                      ? "border-neutral-200 text-neutral-600 hover:border-green-500 hover:text-green-600"
                      : "border-neutral-100 text-neutral-300 cursor-not-allowed"
                  )}
                >
                  <CheckCircle2 size={12} />
                  Entregar
                </button>
              )}

              <div className="flex-1" />

              {/* Assignees */}
              <div className="flex items-center gap-0.5 relative" ref={headerAssigneeRef}>
                {task.assignees?.map((a: any) => (
                  <Avatar key={a.user_id} className={cn("w-6 h-6 border-2", a.delivered_at ? "border-brand-teal" : "border-white")}>
                    <AvatarImage src={a.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                      {getInitials(a.profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                )) ?? (task.assignee && (
                  <Avatar className="w-6 h-6 border-2 border-white">
                    <AvatarImage src={task.assignee.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                      {getInitials(task.assignee.full_name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {!isUser && (
                  <button
                    onClick={() => setHeaderAssigneeOpen((v) => !v)}
                    title="Gerenciar responsável"
                    className="w-6 h-6 rounded-full border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                )}
                {headerAssigneeOpen && (
                  <div className="absolute top-8 right-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 min-w-[170px]">
                    {orgProfiles.map((m) => {
                      const isSelected = (task as any).assignee_id === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            handleAssigneeChange(isSelected ? null : m.id);
                            setHeaderAssigneeOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 transition-colors",
                            isSelected && "text-brand-teal font-semibold"
                          )}
                        >
                          <Avatar className="w-5 h-5 shrink-0">
                            <AvatarImage src={m.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[8px] bg-brand-teal/15 text-brand-teal font-bold">
                              {getInitials(m.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 text-left">{m.full_name ?? m.id}</span>
                          {isSelected && <Check size={11} className="shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Urgent flag */}
              <button
                onClick={() => handleFieldUpdate("is_urgent", String(!(task as any).is_urgent))}
                title="Marcar como urgente"
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-lg transition-colors",
                  (task as any).is_urgent
                    ? "text-destructive bg-destructive/10"
                    : "text-neutral-400 hover:text-destructive hover:bg-destructive/5"
                )}
              >
                <Flag size={14} fill={(task as any).is_urgent ? "currentColor" : "none"} />
              </button>

              {/* Delete */}
              <button
                onClick={() => setDeleteConfirm(true)}
                title="Excluir tarefa"
                className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-400 hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Trash2 size={14} />
              </button>

              {/* Compartilhar */}
              <button
                onClick={() => {
                  const toast = document.createElement('div');
                  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#0B1B3A;color:white;font-size:12px;font-weight:500;padding:10px 16px;border-radius:12px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.15);pointer-events:none;';
                  toast.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Link copiado!</span>';
                  document.body.appendChild(toast);
                  setTimeout(() => toast.remove(), 2000);
                  navigator.clipboard.writeText(`${window.location.origin}/tasks/${task.id}`).catch(() => {});
                }}
                title="Copiar link da tarefa"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-neutral-400 hover:text-brand-navy hover:bg-neutral-100"
              >
                <Link2 size={14} />
              </button>

              {/* Abrir em página própria (somente no modal) */}
              {!isPage && (
                <a
                  href={`/tasks/${task.id}`}
                  title="Abrir em tela cheia"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
                >
                  <ArrowRight size={14} />
                </a>
              )}

              {/* Close */}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Title & meta ────────────────────────────────────── */}
            <div className="px-5 pt-4 pb-3 shrink-0">
              <textarea
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                onBlur={(e) => handleFieldUpdate("title", e.target.value)}
                className="w-full text-xl font-bold text-brand-navy resize-none outline-none bg-transparent leading-snug mb-2"
                rows={2}
              />

              <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-400">
                <span>#{taskId.slice(0, 8).toUpperCase()}</span>
                <span>·</span>
                <span>Criado em {formatDateFull(task.created_at)}</span>

                {/* Priority select */}
                <Select
                  value={task.priority}
                  onValueChange={(v) => v && handleFieldUpdate("priority", v)}
                >
                  <SelectTrigger className="h-6 w-auto text-xs border-neutral-200 gap-1 px-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Stage badge */}
                {(task as any).columns && (
                  <Badge variant="outline" className="text-xs h-6 border-neutral-200">
                    {(task as any).columns?.name}
                  </Badge>
                )}

                {overdue && task.due_date && (
                  <Badge variant="destructive" className="text-xs h-6">
                    Atrasada · {formatDate(task.due_date)}
                  </Badge>
                )}
              </div>
            </div>

            {/* ── Tabs ────────────────────────────────────────────── */}
            <div className="flex items-center gap-0.5 px-5 border-b border-neutral-100 shrink-0 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                    activeTab === id
                      ? "border-brand-teal text-brand-teal"
                      : "border-transparent text-neutral-500 hover:text-brand-navy"
                  )}
                >
                  <Icon size={12} />
                  {label}
                  {id === "comments" && (task._commentCount ?? 0) > 0 && (
                    <span className="px-1 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold">
                      {task._commentCount}
                    </span>
                  )}
                  {id === "checklist" && checklist.length > 0 && (
                    <span className="px-1 rounded-full bg-neutral-100 text-neutral-500 text-[10px]">
                      {doneCount}/{checklist.length}
                    </span>
                  )}
                  {id === "attachments" && attachments.length > 0 && (
                    <span className="px-1 rounded-full bg-neutral-100 text-neutral-500 text-[10px]">
                      {attachments.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Content + sidebar ───────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">
              {/* Main content */}
              <div className="flex-1 overflow-y-auto p-5">

                {/* APPROVAL */}
                <ApprovalBanner taskId={taskId} taskTitle={task.title} />

                {/* DESCRIPTION */}
                {activeTab === "description" && (
                  <RichTextEditor
                    content={task.description ?? ""}
                    onBlur={(html) => handleFieldUpdate("description", html)}
                    placeholder="Adicionar descrição detalhada..."
                  />
                )}

                {/* COMMENTS */}
                {activeTab === "comments" && <CommentList taskId={taskId} />}

                {/* CHECKLIST */}
                {activeTab === "checklist" && (
                  <div className="space-y-3">
                    {checklist.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-neutral-500">
                            {doneCount} de {checklist.length} itens
                          </span>
                          <span className="text-xs font-medium text-brand-navy">
                            {Math.round((doneCount / checklist.length) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className="h-full bg-brand-teal rounded-full transition-all"
                            style={{ width: `${(doneCount / checklist.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 group">
                        <Checkbox
                          checked={item.is_done}
                          onCheckedChange={(v) => handleChecklistToggle(item.id, !!v)}
                          className="shrink-0"
                        />
                        <span className={cn("flex-1 text-sm", item.is_done && "line-through text-neutral-400")}>
                          {item.title}
                        </span>
                        <button
                          onClick={() => handleDeleteChecklistItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-300 hover:text-destructive transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}

                    <form onSubmit={handleAddChecklistItem} className="flex gap-2 mt-2">
                      <Input
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        placeholder="Novo item..."
                        className="h-8 text-xs flex-1 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!newChecklistItem.trim()}
                        className="h-8 w-8 p-0 bg-brand-navy hover:bg-brand-navy-light"
                      >
                        <Plus size={13} />
                      </Button>
                    </form>
                  </div>
                )}

                {/* SUBTASKS */}
                {activeTab === "subtasks" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-neutral-400 font-medium">
                        {subtasks.length} subtarefa{subtasks.length !== 1 ? "s" : ""}
                      </p>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent("open-create-task"))}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
                      >
                        <Plus size={11} />
                        Nova subtarefa
                      </button>
                    </div>
                    {subtasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <GitBranch size={24} className="text-neutral-200 mb-2" />
                        <p className="text-sm text-neutral-400">Sem subtarefas</p>
                        <p className="text-xs text-neutral-300 mt-1">Crie subtarefas para dividir o trabalho</p>
                      </div>
                    ) : (
                      subtasks.map((sub: any) => (
                        <div key={sub.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-neutral-100 hover:border-brand-teal/30 transition-colors">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[sub.priority as keyof typeof PRIORITY_COLORS] ?? "#A0A4A8" }} />
                          <span className={cn("text-sm text-neutral-700 flex-1 leading-snug", sub.status === "delivered" && "line-through text-neutral-400")}>
                            {sub.title}
                          </span>
                          {sub.status === "delivered" && (
                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">Entregue</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* STAGE REQUIREMENTS */}
                {activeTab === "stage" && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">
                        Requisitos da etapa atual
                      </p>
                      {(task as any).columns?.name ? (
                        <p className="text-xs text-neutral-500 mb-3">
                          Etapa: <span className="font-medium text-brand-navy">{(task as any).columns.name}</span>
                        </p>
                      ) : null}
                      <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-4 text-center space-y-2">
                        <ClipboardCheck size={24} className="mx-auto text-neutral-300" />
                        <p className="text-xs text-neutral-400">
                          Nenhum requisito configurado para esta etapa.
                        </p>
                        <a
                          href="#"
                          className="text-xs text-brand-teal hover:underline"
                          onClick={(e) => e.preventDefault()}
                        >
                          Configurar no quadro
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* ATTACHMENTS */}
                {activeTab === "attachments" && (
                  <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        handleFilesAdded(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                        isDragOver
                          ? "border-brand-teal bg-brand-teal/5"
                          : "border-neutral-200 hover:border-brand-teal/60 hover:bg-neutral-50"
                      )}
                    >
                      <Paperclip size={20} className="mx-auto mb-2 text-neutral-400" />
                      <p className="text-xs text-neutral-500">
                        Arraste arquivos aqui ou{" "}
                        <span className="text-brand-teal font-medium">clique para selecionar</span>
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFilesAdded(e.target.files)}
                      />
                    </div>

                    {/* File list */}
                    {attachments.length > 0 ? (
                      <div className="space-y-2">
                        {attachments.map((file) => {
                          const cat = getFileCategory(file.mimeType);
                          const extColor = getFileExtColor(file.name);
                          return (
                            <div
                              key={file.id}
                              onClick={() => setPreviewAttachment(file)}
                              className="flex items-center gap-3 p-2.5 rounded-lg border border-neutral-100 bg-white group hover:border-neutral-200 hover:shadow-sm transition-all cursor-pointer"
                            >
                              {/* Thumbnail / icon */}
                              {cat === "image" && file.dataUrl ? (
                                <img
                                  src={file.dataUrl}
                                  alt={file.name}
                                  className="w-10 h-10 object-cover rounded-md shrink-0 border border-neutral-100"
                                />
                              ) : (
                                <div
                                  className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                                  style={{ background: extColor }}
                                >
                                  {file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "?"}
                                </div>
                              )}

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-brand-navy truncate">{file.name}</p>
                                <p className="text-[10px] text-neutral-400">
                                  {formatFileSize(file.size)} · {formatDate(file.addedAt)}
                                  {!file.dataUrl && file.size > MAX_PREVIEW_BYTES && (
                                    <span className="ml-1 text-amber-500">· arquivo grande, sem preview</span>
                                  )}
                                </p>
                              </div>

                              {/* Actions (visible on hover) */}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span
                                  title="Visualizar"
                                  className="p-1.5 rounded-md text-neutral-400 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
                                >
                                  <Eye size={13} />
                                </span>
                                {file.dataUrl && (
                                  <a
                                    href={file.dataUrl}
                                    download={file.name}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Download"
                                    className="p-1.5 rounded-md text-neutral-400 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
                                  >
                                    <Download size={13} />
                                  </a>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(file.id); }}
                                  title="Remover"
                                  className="p-1.5 rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 text-center py-2">
                        Nenhum anexo adicionado ainda.
                      </p>
                    )}
                  </div>
                )}

                {/* EMAILS */}
                {activeTab === "emails" && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Mail size={28} className="text-neutral-300" />
                    <p className="text-sm text-neutral-400">Nenhum email vinculado a esta tarefa.</p>
                    <button
                      onClick={() => alert("Em breve")}
                      className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark border border-brand-teal/30 rounded-md px-3 py-1.5 hover:bg-brand-teal/5 transition-colors"
                    >
                      <Plus size={12} /> Vincular email
                    </button>
                  </div>
                )}

                {/* RULES */}
                {activeTab === "rules" && <RulesTab taskId={taskId} />}
              </div>

              {/* ── Metadata sidebar ──────────────────────────────── */}
              <div className="w-72 shrink-0 border-l border-neutral-100 overflow-y-auto p-4 space-y-4 bg-neutral-50/40">

                {/* Responsáveis / Alocados */}
                <MetaField label="Responsáveis" icon={<Users size={12} />}>
                  <div className="flex flex-wrap gap-1 items-center relative" ref={assigneePickerRef}>
                    {task.assignee_id ? (() => {
                      const name = task.assignee?.full_name ?? orgProfiles.find((p) => p.id === task.assignee_id)?.full_name ?? task.assignee_id;
                      const initials = getInitials(name);
                      return (
                        <div
                          className={cn(
                            "flex items-center gap-1 bg-white border border-neutral-200 rounded-full px-2 py-0.5",
                            !isUser ? "cursor-pointer hover:border-destructive/40 group" : "cursor-default"
                          )}
                          title={!isUser ? "Clique para remover" : undefined}
                          onClick={() => !isUser && handleAssigneeChange(null)}
                        >
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-[8px] bg-brand-teal/20 text-brand-teal">{initials}</AvatarFallback>
                          </Avatar>
                          <span className={cn("text-[10px] text-neutral-600", !isUser && "group-hover:text-destructive")}>{name}</span>
                        </div>
                      );
                    })() : (
                      <span className="text-[10px] text-neutral-400 italic">Sem responsável</span>
                    )}
                    {!isUser && (
                      <button
                        onClick={() => setAssigneePickerOpen((v) => !v)}
                        className="w-5 h-5 rounded-full border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    )}
                    {assigneePickerOpen && (
                      <div className="absolute top-7 left-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 min-w-[160px]">
                        {orgProfiles.map((m) => {
                          const isSelected = task.assignee_id === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                handleAssigneeChange(isSelected ? null : m.id);
                                setAssigneePickerOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 transition-colors",
                                isSelected && "text-brand-teal font-semibold"
                              )}
                            >
                              <Avatar className="w-5 h-5 shrink-0">
                                <AvatarImage src={m.avatar_url ?? undefined} />
                                <AvatarFallback className="text-[8px] bg-brand-teal/15 text-brand-teal font-bold">
                                  {getInitials(m.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-left">{m.full_name ?? m.id}</span>
                              {isSelected && <Check size={11} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </MetaField>

                {/* Tipo de tarefa */}
                <MetaField label="Tipo de tarefa" icon={<ClipboardCheck size={12} />}>
                  <Select
                    value={(task as any).task_type ?? "Padrão"}
                    onValueChange={(v) => handleFieldUpdate("task_type", v)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Quadro (clicável) */}
                <MetaField label="Quadro" icon={<FileText size={12} />}>
                  <a
                    href={`/boards/${task.project_id}`}
                    className="text-xs font-medium text-brand-navy truncate hover:text-brand-teal hover:underline flex items-center gap-1"
                  >
                    {projectName}
                    <ArrowRight size={10} className="opacity-50" />
                  </a>
                </MetaField>

                {/* Etapa (badge clicável p/ trocar) */}
                <MetaField label="Etapa" icon={<Layers size={12} />}>
                  {boardColumns.length > 0 ? (
                    <Select
                      value={task.column_id}
                      disabled={!canActOnTask}
                      onValueChange={(v) => {
                        if (!v || v === task.column_id) return;
                        setTask((t) => (t ? { ...t, column_id: v } : t));
                        store.moveTask(taskId, v, (task as any).position ?? 1000);
                        taskService.update(taskId, { column_id: v } as any).catch(() => {});
                      }}
                    >
                      <SelectTrigger className={cn("h-7 text-xs border-neutral-200", !canActOnTask && "opacity-60 cursor-not-allowed")} title={!canActOnTask ? "Somente o responsável pode mudar a etapa" : undefined}>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: boardColumns.find((c) => c.id === task.column_id)?.color ?? "#A0A4A8" }}
                          />
                          <span className="truncate">
                            {boardColumns.find((c) => c.id === task.column_id)?.name ?? "Selecionar etapa..."}
                          </span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {boardColumns.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-neutral-400">{(task as any).columns?.name ?? "—"}</p>
                  )}
                </MetaField>

                {/* Projeto interno do board */}
                <MetaField label="Projeto" icon={<Layers size={12} />}>
                  {boardProjectStore.projects.length > 0 ? (
                    <select
                      value={(task as any).board_project_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setTask((t) => t ? { ...t, board_project_id: v } : t);
                        store.updateTask(taskId, { board_project_id: v } as any);
                        taskService.update(taskId, { board_project_id: v } as any).catch(() => {});
                      }}
                      className="text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal"
                    >
                      <option value="">— Sem projeto —</option>
                      {boardProjectStore.projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <a
                      href={`/boards/${task.project_id}/settings`}
                      className="text-xs text-brand-teal hover:underline"
                    >
                      Cadastrar projetos nas configurações →
                    </a>
                  )}
                </MetaField>

                {/* Entrega desejada */}
                <MetaField label="Entrega desejada" icon={<Calendar size={12} />}>
                  <BRDateInput
                    value={task.due_date ?? ""}
                    onChange={(v) => handleFieldUpdate("due_date", v)}
                    className={cn(
                      "text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal",
                      overdue && "border-red-200 text-red-500"
                    )}
                  />
                </MetaField>

                {/* Início desejado */}
                <MetaField label="Início desejado" icon={<Calendar size={12} />}>
                  <BRDateInput
                    value={(task as any).desired_start_date ?? ""}
                    onChange={(v) => handleFieldUpdate("desired_start_date", v)}
                    className="text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal"
                  />
                </MetaField>

                {/* Data início real */}
                <MetaField label="Início real" icon={<Calendar size={12} />}>
                  <BRDateInput
                    value={(task as any).start_date ?? ""}
                    onChange={(v) => handleFieldUpdate("start_date", v)}
                    className="text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal"
                  />
                </MetaField>

                {/* Tempo estimado */}
                <MetaField label="Tempo estimado" icon={<Clock size={12} />}>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={estimatedHours || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          handleFieldUpdate("estimated_hours", v > 0 ? String(v) : null);
                        }}
                        placeholder="0"
                        className="text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal"
                      />
                      <span className="text-[10px] text-neutral-400 shrink-0">h</span>
                    </div>
                    {estimatedHours > 0 && (
                      <>
                        <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(timeRatio * 100, 100)}%`,
                              background: timeBarColor,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400">
                          {formatHours(trackedHours)} / {formatHours(estimatedHours)}
                        </p>
                      </>
                    )}
                  </div>
                </MetaField>

                {/* Tempo registrado */}
                <MetaField label="Tempo registrado" icon={<Clock size={12} />}>
                  <div className="space-y-1.5">
                    {editingTrackedHours ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          value={trackedHoursInput}
                          onChange={(e) => setTrackedHoursInput(e.target.value)}
                          onBlur={commitTrackedHoursEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitTrackedHoursEdit(); }
                            if (e.key === "Escape") setEditingTrackedHours(false);
                          }}
                          placeholder="ex: 1:30 ou 1.5"
                          className="text-xs border border-brand-teal rounded-md px-2 py-1 w-full bg-white outline-none focus:ring-1 focus:ring-brand-teal/30"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const h = Math.floor(trackedHours);
                          const m = Math.round((trackedHours - h) * 60);
                          setTrackedHoursInput(m > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${h}`);
                          setEditingTrackedHours(true);
                        }}
                        className="group flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:text-brand-teal transition-colors"
                        title="Clique para editar o tempo registrado"
                      >
                        {formatHours(trackedHours)}
                        <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                      </button>
                    )}
                    {(task as any).sla_minutes && (
                      <>
                        <div className="h-1 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min((trackedHours * 60 / (task as any).sla_minutes) * 100, 100)}%`,
                              background:
                                trackedHours * 60 / (task as any).sla_minutes < 0.7
                                  ? "#01CFB5"
                                  : trackedHours * 60 / (task as any).sla_minutes < 1
                                    ? "#FFB81C"
                                    : "#AC145A",
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400">
                          Máx: {formatHours((task as any).sla_minutes / 60)}
                        </p>
                      </>
                    )}
                  </div>
                </MetaField>

                {/* Prioridade */}
                <MetaField label="Prioridade" icon={<Flag size={12} />}>
                  <Select
                    value={task.priority}
                    onValueChange={(v) => v && handleFieldUpdate("priority", v)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Área Solicitante */}
                <MetaField label="Área Solicitante" icon={<Users size={12} />}>
                  <Select
                    value={(task as any).requesting_area ?? ""}
                    onValueChange={(v) => handleFieldUpdate("requesting_area", v || null)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AREAS.map((a) => (
                        <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Área Solicitada */}
                <MetaField label="Área Solicitada" icon={<Users size={12} />}>
                  <Select
                    value={(task as any).requested_area ?? ""}
                    onValueChange={(v) => handleFieldUpdate("requested_area", v || null)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AREAS.map((a) => (
                        <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Repetição */}
                <MetaField label="Repetição" icon={<Repeat size={12} />}>
                  <Select
                    value={(task as any).recurrence_config ?? "none"}
                    onValueChange={(v) => handleFieldUpdate("recurrence_config", v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Seguidores */}
                <MetaField label="Seguidores" icon={<UserPlus size={12} />}>
                  <div className="flex flex-wrap gap-1 items-center">
                    <div className="flex -space-x-1.5">
                      {["Você (demo)", "Ana Souza"].map((n) => (
                        <Avatar key={n} className="w-5 h-5 border-2 border-white" title={n}>
                          <AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">{getInitials(n)}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <button title="Adicionar seguidor" className="w-5 h-5 rounded-full border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors">
                      <Plus size={10} />
                    </button>
                  </div>
                </MetaField>

                {/* Checklist resumo (inline) */}
                <MetaField label="Checklist" icon={<ListChecks size={12} />}>
                  {checklist.length > 0 ? (
                    <button
                      onClick={() => setActiveTab("checklist")}
                      className="flex items-center gap-2 w-full group/cl"
                    >
                      <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                        <div className="h-full rounded-full bg-brand-teal" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-neutral-500 shrink-0">{doneCount}/{checklist.length} itens</span>
                    </button>
                  ) : (
                    <button onClick={() => setActiveTab("checklist")} className="text-xs text-brand-teal hover:underline">+ Adicionar checklist</button>
                  )}
                </MetaField>

                {/* Tags */}
                <MetaField label="Tags" icon={<TagIcon size={12} />}>
                  <div className="flex flex-wrap gap-1 items-center">
                    {task.labels?.map((l) => (
                      <span
                        key={l.id}
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ background: `${l.color}20`, color: l.color }}
                      >
                        {l.name}
                      </span>
                    ))}
                    {newTagInput ? (
                      <input
                        autoFocus
                        type="text"
                        value={newTagValue}
                        onChange={(e) => setNewTagValue(e.target.value)}
                        onBlur={handleAddTag}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
                          if (e.key === "Escape") { setNewTagInput(false); setNewTagValue(""); }
                        }}
                        placeholder="Nova tag..."
                        className="text-[10px] border border-brand-teal/60 rounded-full px-2 py-0.5 outline-none bg-white w-20"
                      />
                    ) : (
                      <button
                        onClick={() => setNewTagInput(true)}
                        className="w-5 h-5 rounded-full border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    )}
                  </div>
                </MetaField>

                {/* Detalhes da entrega — visible to leadership after delivery */}
                {isDelivered && ((task as any).delivery_link || (task as any).delivery_note) && (
                  <div className="mt-1 rounded-xl border border-green-200 bg-green-50/60 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                      <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Detalhes da entrega</span>
                    </div>
                    {(task as any).delivery_link && (
                      <div>
                        <p className="text-[10px] text-neutral-500 mb-0.5">Link do material</p>
                        <a
                          href={(task as any).delivery_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-teal hover:underline break-all flex items-center gap-1"
                        >
                          <Link2 size={10} className="shrink-0" />
                          {(task as any).delivery_link}
                        </a>
                      </div>
                    )}
                    {(task as any).delivery_note && (
                      <div>
                        <p className="text-[10px] text-neutral-500 mb-0.5">O que foi entregue</p>
                        <p className="text-xs text-neutral-700 leading-snug">{(task as any).delivery_note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ────────────────────────────────────────────── */}
            <div className="px-5 py-3 border-t border-neutral-100 flex justify-between items-center shrink-0 bg-white">
              <button
                onClick={handleDeleteTask}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-destructive hover:bg-destructive/5 px-2 py-1.5 rounded-md transition-colors"
              >
                <Trash2 size={12} />
                Excluir tarefa
              </button>
              <span className="text-[11px] text-neutral-300">
                Atualizado {formatDate(task.updated_at)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Attachment preview modal — rendered outside the scroll container */}
      {previewAttachment && (
        <AttachmentPreviewModal
          file={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && task && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-brand-navy text-sm">Excluir tarefa</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Tem certeza que deseja excluir <span className="font-medium text-neutral-700">"{task.title}"</span>? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery dialog */}
      {deliveryDialogOpen && task && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeliveryDialogOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-neutral-100">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-brand-navy text-sm">Confirmar entrega</h3>
                <p className="text-xs text-neutral-400 truncate mt-0.5">{task.title}</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Tracked time — HH:MM:SS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Tempo registrado <span className="text-red-400">*</span>
                  </label>
                  {task.estimated_hours != null && (
                    <span className="text-xs text-neutral-400">
                      Estimado: <span className="font-medium text-neutral-600">{task.estimated_hours}h</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 flex items-center bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 gap-1 focus-within:ring-2 focus-within:ring-brand-teal/30 focus-within:border-brand-teal">
                    <input
                      type="number" min="0" max="99"
                      value={deliveryH}
                      onChange={(e) => setDeliveryH(e.target.value)}
                      className="w-8 bg-transparent text-sm text-center focus:outline-none font-mono"
                    />
                    <span className="text-neutral-400 text-sm font-mono">:</span>
                    <input
                      type="number" min="0" max="59"
                      value={deliveryM}
                      onChange={(e) => setDeliveryM(e.target.value.padStart(2, "0"))}
                      className="w-8 bg-transparent text-sm text-center focus:outline-none font-mono"
                    />
                    <span className="text-neutral-400 text-sm font-mono">:</span>
                    <input
                      type="number" min="0" max="59"
                      value={deliveryS}
                      onChange={(e) => setDeliveryS(e.target.value.padStart(2, "0"))}
                      className="w-8 bg-transparent text-sm text-center focus:outline-none font-mono"
                    />
                    <span className="text-xs text-neutral-400 ml-1">h:m:s</span>
                  </div>
                </div>
                {(() => {
                  const totalSec = (parseInt(deliveryH) || 0) * 3600 + (parseInt(deliveryM) || 0) * 60 + (parseInt(deliveryS) || 0);
                  const trackedH = totalSec / 3600;
                  const estimated = task.estimated_hours ?? 0;
                  if (estimated > 0 && trackedH > estimated * 1.2)
                    return <p className="text-xs text-amber-600 mt-1.5">⚠ Tempo {((trackedH / estimated - 1) * 100).toFixed(0)}% acima do estimado</p>;
                  if (estimated > 0 && totalSec > 0 && trackedH < estimated * 0.5)
                    return <p className="text-xs text-blue-500 mt-1.5">Tempo abaixo do estimado — tudo certo?</p>;
                  return null;
                })()}
              </div>

              {/* Material link — optional */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-2">
                  Link do material <span className="text-neutral-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={deliveryLink}
                  onChange={(e) => setDeliveryLink(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                />
              </div>

              {/* Delivery note — optional */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide block mb-1">
                  O que foi entregue? <span className="text-neutral-400 font-normal normal-case">(opcional)</span>
                </label>
                <p className="text-xs text-neutral-400 mb-2">
                  {(task as any).task_type && (task as any).task_type !== "Padrão"
                    ? `Tipo: ${(task as any).task_type} — descreva a quantidade e o que foi produzido.`
                    : "Descreva brevemente o que foi realizado e a quantidade de itens entregues."}
                </p>
                <textarea
                  rows={3}
                  placeholder={`Ex.: ${(task as any).task_type === "Vídeo" ? "2 vídeos editados, aprovados pelo cliente" : (task as any).task_type === "Design" ? "3 layouts aprovados + 1 banner" : "Implementei X, testei Y, entregue Z itens"}`}
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 justify-end px-6 pb-6">
              <button
                onClick={() => setDeliveryDialogOpen(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const totalSec = (parseInt(deliveryH) || 0) * 3600 + (parseInt(deliveryM) || 0) * 60 + (parseInt(deliveryS) || 0);
                  setDeliveryDialogOpen(false);
                  await handleDeliver({
                    hours: totalSec / 3600,
                    link: deliveryLink.trim(),
                    note: deliveryNote.trim(),
                  });
                }}
                className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                Confirmar entrega
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attachment preview modal ──────────────────────────────────────────────────

function AttachmentPreviewModal({ file, onClose }: { file: MockAttachment; onClose: () => void }) {
  const cat = getFileCategory(file.mimeType);
  const extColor = getFileExtColor(file.name);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-h-[92vh]"
        style={{ maxWidth: "900px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 shrink-0">
          {cat === "image" && file.dataUrl ? (
            <img src={file.dataUrl} alt="" className="w-7 h-7 object-cover rounded" />
          ) : (
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              style={{ background: extColor }}
            >
              {file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "?"}
            </div>
          )}
          <span className="text-sm font-medium text-brand-navy flex-1 truncate">{file.name}</span>
          <span className="text-xs text-neutral-400 shrink-0">{formatFileSize(file.size)}</span>
          {file.dataUrl && (
            <a
              href={file.dataUrl}
              download={file.name}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-semibold hover:bg-brand-navy/90 transition-colors shrink-0"
            >
              <Download size={12} />
              Download
            </a>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-auto bg-neutral-50 flex items-center justify-center p-4 min-h-[300px]">
          {cat === "image" && file.dataUrl ? (
            <img
              src={file.dataUrl}
              alt={file.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-md"
            />
          ) : cat === "pdf" && file.dataUrl ? (
            <iframe
              src={file.dataUrl}
              title={file.name}
              className="w-full rounded-lg border-0"
              style={{ height: "72vh" }}
            />
          ) : cat === "video" && file.dataUrl ? (
            <video
              src={file.dataUrl}
              controls
              className="max-w-full max-h-[72vh] rounded-lg shadow-md"
            />
          ) : file.dataUrl ? (
            /* Generic file — show download CTA */
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md"
                style={{ background: extColor }}
              >
                {file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-navy">{file.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{formatFileSize(file.size)}</p>
              </div>
              <a
                href={file.dataUrl}
                download={file.name}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 transition-colors"
              >
                <Download size={15} />
                Fazer download
              </a>
            </div>
          ) : (
            /* File too large or no data stored */
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
                style={{ background: extColor }}
              >
                {file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "?"}
              </div>
              <p className="text-sm font-medium text-brand-navy">{file.name}</p>
              <p className="text-xs text-neutral-400">{formatFileSize(file.size)}</p>
              <p className="text-xs text-neutral-300 mt-1">
                {file.size > MAX_PREVIEW_BYTES
                  ? "Arquivo maior que 5 MB — preview não disponível no modo demo."
                  : "Preview não disponível para este arquivo."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── BRDateInput ───────────────────────────────────────────────────────────────

function BRDateInput({ value, onChange, className }: {
  value: string;
  onChange: (isoDate: string | null) => void;
  className?: string;
}) {
  const toDisplay = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const [inputVal, setInputVal] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setInputVal(toDisplay(value));
  }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^0-9/]/g, "");
    // Auto-insert slashes
    const digits = v.replace(/\//g, "");
    if (digits.length <= 2) v = digits;
    else if (digits.length <= 4) v = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else v = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    setInputVal(v);
    if (v.length === 10) {
      const [d, m, y] = v.split("/");
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (!isNaN(new Date(iso).getTime())) onChange(iso);
    } else if (v === "") {
      onChange(null);
    }
  }

  function handleBlur() {
    setFocused(false);
    const parts = inputVal.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      const iso = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      if (!isNaN(new Date(iso).getTime())) { onChange(iso); return; }
    }
    if (!inputVal) { onChange(null); return; }
    setInputVal(toDisplay(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={inputVal}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      placeholder="DD/MM/AAAA"
      maxLength={10}
      className={className}
    />
  );
}

// ── Helper component ──────────────────────────────────────────────────────────

function MetaField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}




