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
  History,
  Lock,
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
  RotateCcw,
} from "lucide-react";
import { cn, formatDate, formatDateFull, isOverdue, formatHours, formatHms } from "@/lib/utils";
import { PRIORITY_LABELS, PRIORITY_COLORS, formatElapsed } from "@/types";
import { taskService } from "../services/taskService";
import { activityService, type TaskActivity } from "../services/activityService";
import { approvalService, type TaskApproval } from "../services/approvalService";
import { sequenceService, type SeqRow } from "../services/sequenceService";
import { notificationService } from "@/features/notifications/services/notificationService";
import { runAutomations } from "@/lib/automationEngine";
import { useBoardAccess } from "@/lib/boardAccess";
import { areasService } from "@/lib/areasService";
import { attachmentService } from "@/lib/attachmentService";
import { uiPrefsService } from "@/lib/uiPrefsService";
import { tagsService, type Label } from "../services/tagsService";
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
import { createClient, createRawClient } from "@/lib/supabase/client";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { taskTypeService } from "@/features/board/services/taskTypeService";
import type { TaskWithRelations } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type DetailTab = "description" | "comments" | "checklist" | "subtasks" | "stage" | "attachments" | "emails" | "rules" | "history";

const TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: "description", label: "Descrição", icon: FileText },
  { id: "comments", label: "Comentários", icon: MessageSquare },
  { id: "checklist", label: "Checklist", icon: ListChecks },
  { id: "subtasks", label: "Subtarefas", icon: GitBranch },
  { id: "stage", label: "Req. Etapa", icon: ClipboardCheck },
  { id: "attachments", label: "Anexos", icon: Paperclip },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "rules", label: "Regras", icon: Zap },
  { id: "history", label: "Histórico", icon: History },
];

// Serializes recent-view writes within the tab so rapid task opens don't
// interleave (get→set race) and drop entries.
let recentViewsChain: Promise<void> = Promise.resolve();

interface MockAttachment {
  id: string;
  name: string;
  size: number;
  addedAt: string;
  mimeType?: string;
  dataUrl?: string; // public Storage URL (inline preview)
  downloadUrl?: string; // forces download with original filename
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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


// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  taskId: string;
  onClose: () => void;
  variant?: "modal" | "page";
  /** Abre o popup de entrega automaticamente (ex.: ao arrastar p/ "Concluído"). */
  autoOpenDelivery?: boolean;
}


export function TaskDetail({ taskId, onClose, variant = "modal", autoOpenDelivery = false }: Props) {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  // Board-level edit permission (view-only members can't change fields)
  const { access: boardAccess } = useBoardAccess((task as any)?.project_id ?? "");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false); // task inexistente ou na Lixeira
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newTagInput, setNewTagInput] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<MockAttachment | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Attachments live in Supabase Storage + the task_attachments table. On first
  // open we migrate any legacy localStorage attachments (data URLs) into Storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = `mwr_attachments_${taskId}`;
      let local: MockAttachment[] = [];
      try { const raw = localStorage.getItem(key); local = raw ? JSON.parse(raw) : []; } catch { /* ignore */ }
      if (local.length > 0) {
        // Claim the key synchronously (before any await) so a concurrent run
        // — e.g. React StrictMode's double-invoke — migrates nothing twice.
        localStorage.removeItem(key);
        const failed: MockAttachment[] = [];
        for (const a of local) {
          if (!a.dataUrl) continue;
          const r = await attachmentService.uploadDataUrl(taskId, a.name, a.mimeType, a.dataUrl);
          if (!r) failed.push(a); // keep failures to retry — never lose the only copy
        }
        if (failed.length) { try { localStorage.setItem(key, JSON.stringify(failed)); } catch { /* ignore */ } }
      }
      const list = await attachmentService.list(taskId);
      if (!cancelled) setAttachments(list);
    })();
    return () => { cancelled = true; };
  }, [taskId]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [headerAssigneeOpen, setHeaderAssigneeOpen] = useState(false);
  const [followers, setFollowers] = useState<string[]>([]);
  const [followersOpen, setFollowersOpen] = useState(false);
  const followersRef = useRef<HTMLDivElement>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [followerSearch, setFollowerSearch] = useState("");
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
  const [trackedParts, setTrackedParts] = useState({ h: 0, m: 0, s: 0 });
  const [editingEstimatedHours, setEditingEstimatedHours] = useState(false);
  const [estimatedParts, setEstimatedParts] = useState({ h: 0, m: 0, s: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const headerAssigneeRef = useRef<HTMLDivElement>(null);

  const store = useBoardStore();
  const { user } = useAuthStore();
  const { isUser, isAdmin } = useRole();
  const timerStore = useTimerStore();
  const projectStore = useProjectStore();
  const boardColumns = useBoardStore((s) => s.columns);
  const subtasks = useMemo(
    () => boardColumns.flatMap((c) => c.tasks).filter((t: any) => t.parent_task_id === taskId),
    [boardColumns, taskId]
  );

  const isTimerActive = timerStore.activeTaskId === taskId;
  const elapsed = timerStore.getElapsedForTask(taskId);

  // Roster da org via cache global compartilhado (fetch único por sessão) — antes
  // cada TaskDetail refazia o fetch, então "Criado por" e os pickers demoravam.
  const orgProfiles = useOrgMembers();
  // Current user first in member pickers (assignee/followers) for quick self-pick.
  const orgProfilesMeFirst = useMemo(() => {
    const uid = user?.id;
    if (!uid) return orgProfiles;
    const me = orgProfiles.find((p) => p.id === uid);
    return me ? [me, ...orgProfiles.filter((p) => p.id !== uid)] : orgProfiles;
  }, [orgProfiles, user?.id]);

  // Areas (managed by superadmin) for the "Área solicitante" dropdown
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { areasService.list().then(setAreas); }, []);

  // Block delivery unless the latest approval is "approved".
  // pending → aguardando; adjustment → precisa de ajuste; rejected → reprovada.
  const [approvalBlockStatus, setApprovalBlockStatus] = useState<"pending" | "adjustment" | "rejected" | null>(null);
  const pendingApproval = approvalBlockStatus !== null;
  const [deliverBlockedWarning, setDeliverBlockedWarning] = useState(false);
  // Entrega "estacionada": registrada e aguardando a aprovação pendente ser aprovada.
  const [parkedDelivery, setParkedDelivery] = useState(false);
  // Confirmação antes de estacionar a entrega (há aprovação pendente).
  const [parkConfirm, setParkConfirm] = useState<{
    mode: "full" | "part";
    opts: { hours: number; link: string; note: string };
    approval: TaskApproval;
  } | null>(null);
  async function refreshPendingApproval() {
    const rows = await approvalService.getForTask(taskId);
    const latest = rows[0];
    const blocking = latest?.status && latest.status !== "approved" ? (latest.status as "pending" | "adjustment" | "rejected") : null;
    setApprovalBlockStatus(blocking);
    setParkedDelivery(!!(latest?.status === "pending" && latest.deliver_on_approve));
    return blocking !== null;
  }
  useEffect(() => { refreshPendingApproval(); /* eslint-disable-next-line */ }, [taskId]);

  // Responsible queue (fila) — the head drives the assignee
  const [queue, setQueue] = useState<SeqRow[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  async function loadQueue() {
    let rows = await sequenceService.list(taskId);
    // Detecção por MODO (não por status das linhas): uma task paralela ENTREGUE
    // fica com todas as linhas "done", então "todas active" não a reconheceria e
    // o self-heal a colapsaria para sequencial (zerando responsável). Busca o
    // assignment_mode direto do banco pois o `task` local pode não ter carregado.
    const { data: modeRow } = await (createRawClient() as any)
      .from("tasks").select("assignment_mode").eq("id", taskId).maybeSingle();
    const parallelMode = (modeRow as any)?.assignment_mode === "parallel" && rows.length >= 2;
    if (rows.length > 0 && !parallelMode) {
      const nonDone = rows.filter((r) => r.status !== "done");
      const headId = nonDone[0]?.user_id ?? null;
      // Self-heal desynced queues: ensure the head is the assignee (queue drives it).
      const needsHeal =
        (nonDone.length > 0 && nonDone[0].status !== "active") ||
        nonDone.slice(1).some((r) => r.status === "active") ||
        ((task as any)?.assignee_id ?? null) !== headId;
      if (needsHeal) {
        await sequenceService.syncHeadAndAssignee(taskId);
        rows = await sequenceService.list(taskId);
        const p = orgProfiles.find((x) => x.id === headId);
        const assignee = p ? { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url } : null;
        setTask((t) => (t ? ({ ...t, assignee_id: headId, assignee } as TaskWithRelations) : t));
        store.updateTask(taskId, { assignee_id: headId, assignee, sequence: rows } as any);
      }
    }
    setQueue(rows);
    setQueueLoaded(true);
  }
  useEffect(() => { loadQueue(); /* eslint-disable-next-line */ }, [taskId]);
  const queueRemaining = queue.filter((r) => r.status !== "done").length;
  // Modo paralelo: vários responsáveis simultâneos (definido pela lateral). No
  // paralelo não há "fila"/partes — a entrega é única e qualquer um pode fazê-la.
  const isParallel = (task as any)?.assignment_mode === "parallel" && queue.length >= 2;
  const activeQueueUserId = queue.find((r) => r.status === "active")?.user_id
    ?? queue.find((r) => r.status !== "done")?.user_id ?? null;
  // Só no modo SEQUENCIAL o "responsável atual" (cabeça da fila) entrega a parte.
  const isActiveResponsible = !isParallel && !!activeQueueUserId && activeQueueUserId === user?.id;
  // A responsible who already delivered their part (can reopen it at any time).
  // Só no modo sequencial — no paralelo a entrega é única (usa "Entregue · Reabrir").
  const myDoneRow = !isParallel ? (queue.find((r) => r.status === "done" && r.user_id === user?.id) ?? null) : null;

  // "part" = advance the queue via the same delivery popup; "full" = deliver task
  const [deliveryMode, setDeliveryMode] = useState<"full" | "part">("full");

  // If the timer is running for this task, stop it first so its elapsed time is
  // flushed into tracked_hours (and it doesn't keep running / double-count after
  // delivery). Keeps the task total consistent with the sum of the parts.
  async function flushActiveTimer() {
    const ts = useTimerStore.getState();
    if (ts.activeTaskId !== taskId || !user?.id) return;
    await ts.stopTimer(user.id);
    const { data } = await (createRawClient() as any)
      .from("tasks").select("tracked_hours").eq("id", taskId).maybeSingle();
    if (data) {
      setTask((t) => (t ? ({ ...t, tracked_hours: data.tracked_hours } as TaskWithRelations) : t));
      store.updateTask(taskId, { tracked_hours: data.tracked_hours } as any);
    }
  }

  // Ponto único de entrega (parte OU total). Decide entre: entregar normalmente,
  // ESTACIONAR (se há aprovação pendente → concretiza ao aprovar) ou bloquear
  // (aprovação rejeitada/pediu ajuste → precisa nova aprovação).
  async function submitDelivery(mode: "full" | "part", opts: { hours: number; link: string; note: string }) {
    const rows = await approvalService.getForTask(taskId);
    const latest = rows[0];
    if (latest && latest.status === "pending") {
      // Há aprovação pendente → confirmar e estacionar a entrega.
      setDeliveryDialogOpen(false);
      setParkConfirm({ mode, opts, approval: latest });
      return;
    }
    if (latest && (latest.status === "adjustment" || latest.status === "rejected")) {
      // Reprovada / pediu ajuste → não entrega até haver nova aprovação aprovada.
      setApprovalBlockStatus(latest.status);
      setDeliveryDialogOpen(false);
      setDeliverBlockedWarning(true);
      return;
    }
    // Aprovada ou sem aprovação → entrega normal.
    setDeliveryDialogOpen(false);
    if (mode === "part") await handleDeliverMyPart(opts);
    else await handleDeliver(opts);
  }

  // Estaciona a entrega: anexa o payload à aprovação pendente. Ela só será
  // concretizada quando o aprovador aprovar (deliveryService.finalize).
  async function confirmPark() {
    if (!parkConfirm || !task) return;
    const { mode, opts, approval } = parkConfirm;
    const alreadyParked = !!approval.deliver_on_approve; // re-park: não duplicar avisos
    // Para o timer e consolida o tempo em tracked_hours ANTES de guardar o payload,
    // igual aos caminhos de entrega ao vivo — senão o timer segue contando enquanto
    // aguarda aprovação e desincroniza as horas/partes da fila.
    await flushActiveTimer();
    const myName = orgProfiles.find((p) => p.id === user?.id)?.full_name ?? null;
    const ok = await approvalService.setDeliverOnApprove(approval.id, {
      mode, hours: opts.hours, note: opts.note || null, link: opts.link || null,
    });
    if (!ok) { setParkConfirm(null); return; } // ex.: migração ainda não aplicada
    if (!alreadyParked) {
      await activityService.log({
        taskId, userId: user?.id ?? null, userName: myName,
        action: "Anexou uma entrega à aprovação (aguardando aprovação)",
      });
      if (approval.approver_id) await notificationService.create({
        userId: approval.approver_id, type: "approval_requested", taskId, fromUserId: user?.id ?? null,
        content: `${myName ?? "Alguém"} anexou uma entrega à sua aprovação em "${task.title}" — será concretizada ao aprovar`,
      });
    }
    setParkConfirm(null);
    setDeliverBlockedWarning(false);
    setParkedDelivery(true);
  }

  // Called from the delivery dialog when in "part" mode.
  async function handleDeliverMyPart(opts?: { hours?: number; link?: string; note?: string }) {
    if (!task) return;
    await flushActiveTimer();
    // Record this member's part (time delta + what they delivered)
    const { finished, nextUserId } = await sequenceService.advance(taskId, {
      hours: opts?.hours,
      note: opts?.note || null,
      link: opts?.link || null,
    });
    if (finished) {
      await handleDeliver(opts); // finalizes the task (saves hours/link/note, moves column)
    } else {
      // Reflect the new responsible immediately (no refresh) with resolved profile
      const p = orgProfiles.find((x) => x.id === nextUserId);
      const assignee = p ? { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url } : null;
      const rows = await sequenceService.list(taskId);
      setTask((t) => (t ? ({ ...t, assignee_id: nextUserId, assignee } as TaskWithRelations) : t));
      store.updateTask(taskId, { assignee_id: nextUserId, assignee, sequence: rows } as any);
    }
    loadQueue();
  }

  function openDeliveryDialog(mode: "full" | "part") {
    if (!task) return;
    // For a part, prefill with the delta since this member's turn started;
    // for the full delivery, prefill with the task's total tracked time.
    let totalSec: number;
    if (mode === "part") {
      const active = queue.find((r) => r.status === "active") ?? queue.find((r) => r.status !== "done");
      const baseline = active?.part_start_hours ?? 0;
      const partHours = Math.max(0, (task.tracked_hours ?? 0) - baseline);
      totalSec = Math.round(partHours * 3600) + elapsed;
    } else {
      totalSec = Math.round((task.tracked_hours ?? 0) * 3600) + elapsed;
    }
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    setDeliverySeconds(totalSec);
    setDeliveryH(String(h));
    setDeliveryM(String(m).padStart(2, "0"));
    setDeliveryS(String(s).padStart(2, "0"));
    setDeliveryLink(mode === "part" ? "" : ((task as any).delivery_link ?? ""));
    setDeliveryNote(mode === "part" ? "" : ((task as any).delivery_note ?? ""));
    setDeliveryMode(mode);
    setDeliveryDialogOpen(true);
  }

  // Board task types (per board, from the DB via taskTypeService)
  const [boardTypes, setBoardTypes] = useState<{ id: string; name: string; color: string; default_hours?: number }[]>([]);
  useEffect(() => {
    const pid = task?.project_id;
    if (!pid) return;
    // List exactly what exists in the DB — no fallback/auto-seed, so deleted
    // types never reappear. Same source as the create-task modal.
    let cancelled = false;
    taskTypeService.list(pid).then((types) => {
      if (!cancelled) setBoardTypes(types);
    });
    return () => { cancelled = true; };
  }, [task?.project_id]);

  // Board tags (per board) + this task's tags, from Supabase
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  useEffect(() => {
    const pid = task?.project_id;
    if (pid) tagsService.listForBoard(pid).then(setBoardLabels);
  }, [task?.project_id]);
  useEffect(() => {
    tagsService.listForTask(taskId).then((labels) => {
      if (labels.length > 0) setTask((t) => (t ? ({ ...t, labels } as TaskWithRelations) : t));
    });
  }, [taskId]);

  // Board sub-projects (per board) for the "Projeto" dropdown
  const [boardProjects, setBoardProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  useEffect(() => {
    const pid = task?.project_id;
    if (!pid) return;
    const sb = createRawClient();
    (sb as any)
      .from("board_subprojects")
      .select("id, name, color")
      .eq("project_id", pid)
      .order("name")
      .then(({ data }: { data: { id: string; name: string; color: string }[] | null }) => setBoardProjects(data ?? []));
  }, [task?.project_id]);

  // Followers — persisted in Supabase (task_followers)
  useEffect(() => {
    const sb = createRawClient();
    (sb as any)
      .from("task_followers")
      .select("user_id")
      .eq("task_id", taskId)
      .then(({ data }: { data: { user_id: string }[] | null }) => {
        setFollowers((data ?? []).map((r) => r.user_id));
      });
  }, [taskId]);

  async function toggleFollower(id: string) {
    const sb = createRawClient();
    const isFollowing = followers.includes(id);
    // optimistic
    setFollowers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (isFollowing) {
      const { error } = await (sb as any).from("task_followers").delete().eq("task_id", taskId).eq("user_id", id);
      if (error) { console.error("[followers] remove error:", error); setFollowers((prev) => [...prev, id]); }
    } else {
      const { error } = await (sb as any).from("task_followers").insert({ task_id: taskId, user_id: id });
      if (error) { console.error("[followers] add error:", error); setFollowers((prev) => prev.filter((x) => x !== id)); }
    }
  }

  // Close followers picker on outside click
  useEffect(() => {
    if (!followersOpen) return;
    function h(e: MouseEvent) {
      if (followersRef.current && !followersRef.current.contains(e.target as Node)) setFollowersOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [followersOpen]);

  // Load task
  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    taskService.get(taskId).then((t) => {
      setTask(t);
      setNotFound(!t); // null = inexistente ou na Lixeira
      setLoading(false);
      // NÃO tocar no boardProjectStore global aqui: o picker usa o estado local
      // `boardProjects` (fetch scopado abaixo). Escrever no store global fazia os
      // sub-projetos vazarem entre quadros (ex.: abrir task de outro quadro no /me).
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Mantém o estado de aprovação/entrega vivo: quando o aprovador resolve (em
  // outra aba/máquina) a entrega estacionada é finalizada headless — aqui
  // reavaliamos o banner "parcialmente entregue", a fila e a própria task.
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`task-detail-approvals:${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_approvals", filter: `task_id=eq.${taskId}` }, () => {
        refreshPendingApproval();
        loadQueue();
        taskService.get(taskId).then((t) => { if (t) setTask(t); });
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Record recent view (for header history) — persisted per-user in the DB.
  useEffect(() => {
    if (!task || !user?.id) return;
    const uid = user.id;
    const boardName = projectStore.projects.find((p) => p.id === task.project_id)?.name ?? "Quadro";
    const entry = { id: taskId, title: task.title, board: boardName, viewed_at: new Date().toISOString() };
    recentViewsChain = recentViewsChain.then(async () => {
      const prev = await uiPrefsService.get<any[]>(uid, "recent_views");
      const next = [entry, ...(prev ?? []).filter((r) => r.id !== taskId)].slice(0, 10);
      await uiPrefsService.set(uid, "recent_views", next);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Derived project name
  const projectName = task?.project_id
    ? (projectStore.projects.find((p) => p.id === task.project_id)?.name ?? "—")
    : "—";

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleFieldUpdate(field: string, value: string | null) {
    if (!task) return;
    // Creator, any responsible (assignee or in the queue) and admins can edit
    // the card — plus anyone with board edit access.
    const isCreator = (task as any).created_by === user?.id;
    const isResp = task.assignee_id === user?.id || queue.some((qq) => qq.user_id === user?.id);
    if (!(boardAccess.canEdit || !isUser || isCreator || isResp)) return;
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
    // O responsável atual pode registrar tempo. No modo paralelo, qualquer um
    // dos responsáveis simultâneos também pode.
    const canTime = task?.assignee_id === user.id || (isParallel && queue.some((r) => r.user_id === user.id));
    if (task && !canTime) return;
    if (isTimerActive) {
      await timerStore.stopTimer(user.id);
    } else {
      if (!(task as any)?.start_date) {
        await handleFieldUpdate("start_date", new Date().toISOString().split("T")[0]);
      }
      await timerStore.startTimer(user.id, taskId);
    }
  }

  async function handleTrackedHoursUpdate(hours: number) {
    if (!task) return;
    // Round to the nearest second (not to 0.01h). Rounding to hundredths of an
    // hour turned 1min (0.0167h) into 0.02h = 72s, adding a phantom +12s.
    const rounded = Math.round(hours * 3600) / 3600;
    setTask((t) => t ? { ...t, tracked_hours: rounded } : t);
    store.updateTask(taskId, { tracked_hours: rounded } as any);
    await taskService.update(taskId, { tracked_hours: rounded } as any).catch(() => {
      setTask(task);
      store.updateTask(taskId, { tracked_hours: task.tracked_hours } as any);
    });
  }


  async function handleDeliver(opts?: { hours?: number; link?: string; note?: string }) {
    if (!task) return;
    if (isDelivered) return;
    // Gate de aprovação (estacionar/bloquear) é feito em submitDelivery, ANTES
    // de chegar aqui — aqui a entrega já está liberada para concretizar.

    await flushActiveTimer(); // no-op if already stopped by handleDeliverMyPart

    await handleFieldUpdate("status", "delivered");

    // Persist the delivery summary (date, link, note) so the "Tarefa entregue"
    // box shows what was delivered. For a single responsible (no queue) the
    // dialog's time is the task total; with a queue the total is already
    // accumulated and each part's time lives on task_sequences.
    // Split guaranteed columns from the newer link/note columns so a pending
    // migration (supabase_task_delivery_details.sql) can't block the whole save.
    // No modo paralelo a entrega é ÚNICA (como o responsável único): o resumo
    // (horas/link/nota) fica no nível da task, não por parte.
    const taskLevelSummary = queue.length === 0 || isParallel;
    const basePatch: Record<string, unknown> = { delivery_date: new Date().toISOString() };
    if (taskLevelSummary && typeof opts?.hours === "number") {
      basePatch.tracked_hours = Math.round(opts.hours * 3600) / 3600;
    }
    const notePatch: Record<string, unknown> = {};
    if (opts?.link != null) notePatch.delivery_link = opts.link || null;
    if (opts?.note != null) notePatch.delivery_note = opts.note || null;
    // Paralelo: marca TODOS os responsáveis como entregues (um entrega → todos)
    // e recarrega a fila para o estado local refletir a entrega.
    if (isParallel) {
      await sequenceService.markAllDone(taskId).catch((e) => console.error("[handleDeliver] markAllDone", e));
      loadQueue();
    }
    setTask((t) => (t ? ({ ...t, ...basePatch, ...notePatch } as any) : t));
    store.updateTask(taskId, { ...basePatch, ...notePatch } as any);
    taskService.update(taskId, basePatch as any).catch((e) => console.error("[handleDeliver] persist delivery", e));
    if (Object.keys(notePatch).length) {
      taskService.update(taskId, notePatch as any).catch((e) =>
        console.error("[handleDeliver] link/note — rode supabase_task_delivery_details.sql", e));
    }

    // Move to the "done" column (is_done_column marcada, senão a última por posição
    // — mesma resolução do resto do app e do deliveryService.finalize).
    const sorted = [...boardColumns].sort((a, b) => a.position - b.position);
    const lastCol = boardColumns.find((c) => (c as any).is_done_column) ?? sorted[sorted.length - 1];
    if (lastCol && lastCol.id !== task.column_id) {
      const pos = (task as any).position ?? 1000;
      setTask((t) => (t ? { ...t, column_id: lastCol.id } : t));
      store.moveTask(taskId, lastCol.id, pos);
      // Aguarda a persistência da coluna ANTES de disparar as automações, para o
      // motor não ler a etapa antiga (condições de etapa na entrega).
      await taskService.update(taskId, { column_id: lastCol.id } as any).catch(() => {});
    }

    // Dispara automações com gatilho "Tarefa entregue".
    runAutomations({ type: "task_delivered" }, taskId);
  }

  async function handleReopen() {
    if (!task) return;
    await handleFieldUpdate("status", "open");

    // Paralelo: a entrega marcou todos os responsáveis como "done" — reabrir volta
    // todos para "active" (inverso do markAllDone), senão os avatares seguem como
    // "entregue" e a caixa de entrega persiste numa task já aberta.
    if (isParallel) {
      await sequenceService.markAllActive(taskId).catch((e) => console.error("[handleReopen] markAllActive", e));
      await loadQueue();
    }

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

  // A responsible who already delivered reopens THEIR part: the queue returns to
  // them (they become active again), everyone after them goes back to pending,
  // and those pushed back are notified they must wait longer.
  async function handleReopenMyPart() {
    if (!task || !user?.id) return;
    const myRow = queue.find((q) => q.user_id === user.id && q.status === "done");
    if (!myRow) return;
    const { affectedUserIds } = await sequenceService.reopenFrom(taskId, myRow.id);
    // If the whole task had been delivered, bring it back to an active stage.
    if (isDelivered) await handleReopen();
    // Notify everyone who was after me that their turn was pushed back — deduped
    // and never to myself (the same member can appear more than once in a queue).
    const myName = orgProfiles.find((p) => p.id === user.id)?.full_name ?? "Um responsável";
    const targets = [...new Set(affectedUserIds)].filter((id) => id && id !== user.id);
    await Promise.all(
      targets.map((uid) =>
        notificationService.create({
          userId: uid,
          type: "task_assigned",
          content: `${myName} reabriu a parte em "${task.title}". Sua vez foi adiada — pode ser necessário esperar mais.`,
          taskId,
          fromUserId: user.id,
        })
      )
    );
    await loadQueue();
  }

  async function handleDeleteTask() {
    if (!task) return;
    const snapshot = task;
    store.removeTask(taskId);
    setDeleteConfirm(false);
    try {
      await taskService.delete(taskId);
      onClose();
    } catch (e) {
      console.error("[handleDeleteTask]", e);
      // Rollback: reação otimista já removeu o card; devolve em caso de falha.
      if (snapshot.column_id) store.addTask(snapshot.column_id, snapshot as any);
      alert("Não foi possível excluir a tarefa. Tente novamente.");
    }
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
    const uploaded = await Promise.all(
      Array.from(files).map((f) => attachmentService.upload(taskId, f))
    );
    const ok = uploaded.filter(Boolean) as MockAttachment[];
    if (ok.length) {
      setAttachments((prev) => [...prev, ...ok]);
      // Keep the board card/list badge in sync (outside the state updater).
      store.updateTask(taskId, { _attachmentCount: attachments.length + ok.length } as any);
      // Dispara automações com gatilho "Anexo adicionado".
      runAutomations({ type: "attachment_added" }, taskId);
    }
    const failed = uploaded.length - ok.length;
    if (failed > 0) alert(`${failed} anexo(s) não puderam ser enviados. Tente novamente.`);
  }

  async function handleDeleteAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id)); // optimistic
    store.updateTask(taskId, { _attachmentCount: Math.max(0, attachments.length - 1) } as any);
    await attachmentService.remove(id);
  }

  async function handleAddTag() {
    const name = newTagValue.trim();
    setNewTagInput(false);
    setNewTagValue("");
    if (!task || !name || !canEditCard) return;
    const label = await tagsService.ensureLabel(task.project_id, name);
    if (!label) return;
    // avoid duplicates
    if ((task.labels ?? []).some((l: any) => l.id === label.id)) return;
    await tagsService.attach(taskId, label.id);
    setTask((t) => (t ? { ...t, labels: [...(t.labels ?? []), label as any] } : t));
    store.updateTask(taskId, { labels: [...((task.labels as any[]) ?? []), label] } as any);
    if (!boardLabels.some((l) => l.id === label.id)) setBoardLabels((prev) => [...prev, label]);
  }

  async function handleRemoveTag(labelId: string) {
    if (!task || !canEditCard) return;
    await tagsService.detach(taskId, labelId);
    const next = (task.labels ?? []).filter((l: any) => l.id !== labelId);
    setTask((t) => (t ? { ...t, labels: next } : t));
    store.updateTask(taskId, { labels: next } as any);
  }

  async function handleAssigneeChange(newUserId: string | null) {
    if (!task) return;
    await handleFieldUpdate("assignee_id", newUserId);
  }

  // Define os responsáveis pela lateral. 2+ = modo PARALELO (todos juntos, entrega
  // única); 0/1 = responsável único (modo sequencial). Reconcilia task_sequences.
  async function handleResponsiblesChange(nextIds: string[]) {
    if (!task) return;
    const ids = [...new Set(nextIds.filter(Boolean))];
    await sequenceService.setSidebarResponsibles(taskId, ids);
    const mode = ids.length >= 2 ? "parallel" : "sequential";
    const primary = ids[0] ?? null;
    const p = orgProfiles.find((x) => x.id === primary);
    const assignee = p ? { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url } : null;
    const rows = await sequenceService.list(taskId);
    setTask((t) => (t ? ({ ...t, assignee_id: primary, assignee, assignment_mode: mode } as any) : t));
    store.updateTask(taskId, { assignee_id: primary, assignee, sequence: rows, assignment_mode: mode } as any);
    setQueue(rows);
  }
  // Ids dos responsáveis atuais (paralelo = todos da fila; senão o responsável único).
  const selectedResponsibleIds: string[] = isParallel
    ? queue.map((r) => r.user_id)
    : (task?.assignee_id ? [task.assignee_id] : []);

  // ── Recorrência ──────────────────────────────────────────────────────────
  function computeNextRun(freq: string): string {
    const d = new Date();
    if (freq === "daily") d.setDate(d.getDate() + 1);
    else if (freq === "weekly") d.setDate(d.getDate() + 7);
    else if (freq === "biweekly") d.setDate(d.getDate() + 14);
    else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  async function saveRecurrence(cfg: Record<string, unknown> | null) {
    if (!canEditCard) return;
    setTask((t) => (t ? ({ ...t, recurrence_config: cfg } as TaskWithRelations) : t));
    store.updateTask(taskId, { recurrence_config: cfg } as any);
    await taskService.update(taskId, { recurrence_config: cfg } as any).catch(() => {});
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const checklist = task?.checklist_items ?? [];
  const doneCount = checklist.filter((i) => i.is_done).length;

  // A task is only "delivered" when its status field is delivered AND it sits in
  // the last column of the board. Dragging a card back to an earlier stage should
  // automatically make it re-deliverable (the delivered badge disappears).
  const lastColumnId = useMemo(() => {
    if (!boardColumns.length) return null;
    const done = boardColumns.find((c) => (c as any).is_done_column);
    return (done ?? [...boardColumns].sort((a, b) => a.position - b.position).at(-1))?.id ?? null;
  }, [boardColumns]);
  const isDelivered =
    (task as any)?.status === "delivered" &&
    (!lastColumnId || task?.column_id === lastColumnId);
  const overdue = isOverdue(task?.due_date);
  // Effective estimate: explicit per-task value, else the task type's estimate.
  const explicitEstimate: number = (task as any)?.estimated_hours ?? 0;
  const typeEstimate: number =
    boardTypes.find((t) => t.name === (task as any)?.task_type)?.default_hours ?? 0;
  const estimatedHours: number = explicitEstimate > 0 ? explicitEstimate : typeEstimate;
  const trackedHours: number = task?.tracked_hours ?? 0;
  const timeRatio = estimatedHours > 0 ? trackedHours / estimatedHours : 0;
  const timeBarColor = timeRatio < 0.7 ? "#01CFB5" : timeRatio <= 1 ? "#FFB81C" : "#AC145A";

  // Role-based action gating
  const isAssignee = task?.assignee_id === user?.id;
  const isInQueue = !!user?.id && queue.some((q) => q.user_id === user.id);
  // No modo PARALELO todos os responsáveis têm ação total (entregar/cronometrar);
  // no sequencial isso fica com a cabeça da fila (assignee).
  const amResponsible = !!isAssignee || (isParallel && isInQueue);
  const canActOnTask = !isUser || amResponsible;
  // Changing the stage is allowed for ANY responsible in the queue (not just
  // the current head) — deliver/reopen stay restricted to the active one.
  const canChangeStage = !isUser || !!isAssignee || isInQueue;
  // Editing the card (title, responsible, dates, type…) — creator, any
  // responsible, admins, or anyone with board edit access.
  const isCreatorOfTask = !!user?.id && (task as any)?.created_by === user.id;
  const canEditCard = boardAccess.canEdit || !isUser || !!isAssignee || isInQueue || isCreatorOfTask;

  // Delivery summary ("Tarefa entregue" box). Shows when the task is delivered
  // OR any responsible in the queue has delivered their part (parcial).
  const doneParts = queue.filter((q) => q.status === "done");
  const showDeliveryBox = isDelivered || doneParts.length > 0;
  const deliveryDate = (task as any)?.delivery_date as string | null | undefined;
  const fmtBrDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

  // Quando aberto via arrastar-para-"Concluído", abre o popup de entrega assim
  // que a task e a fila carregam (uma vez só). Espelha a lógica do botão Entregar.
  const autoDeliveryDoneRef = useRef(false);
  useEffect(() => {
    if (!autoOpenDelivery || autoDeliveryDoneRef.current) return;
    if (!task || !queueLoaded) return;
    autoDeliveryDoneRef.current = true;
    if (isDelivered) return;
    if (queueRemaining > 0 && !isParallel) {
      // Fila sequencial: só o responsável atual entrega a parte.
      if (isActiveResponsible) openDeliveryDialog("part");
    } else if (canActOnTask) {
      // Paralelo (ou sem fila): entrega única.
      openDeliveryDialog("full");
    }
  }, [autoOpenDelivery, task, queueLoaded, isDelivered, queueRemaining, isParallel, isActiveResponsible, canActOnTask]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {notFound ? (
          <div className="p-8 flex flex-col items-center justify-center text-center gap-3 h-full">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
              <Trash2 size={22} className="text-neutral-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-navy">Tarefa não encontrada</h3>
              <p className="text-xs text-neutral-500 mt-1">Ela pode ter sido apagada e estar na Lixeira do quadro (recuperável por 7 dias).</p>
            </div>
            <button onClick={onClose} className="mt-1 text-xs px-3 py-1.5 rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50">Fechar</button>
          </div>
        ) : loading || !task ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 shrink-0">
              {/* Timer button — only the current responsible can register time */}
              {(() => {
                const canTrack = amResponsible;
                return (
                  <button
                    onClick={canTrack ? handleToggleTimer : undefined}
                    disabled={!canTrack}
                    title={canTrack ? undefined : "Somente o responsável atual pode registrar tempo"}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      isTimerActive
                        ? "bg-brand-teal text-white"
                        : "border border-neutral-200 text-neutral-600 hover:border-brand-teal hover:text-brand-teal",
                      !canTrack && "opacity-50 cursor-not-allowed hover:border-neutral-200 hover:text-neutral-600"
                    )}
                  >
                    {isTimerActive ? <Square size={12} /> : <Play size={12} />}
                    {isTimerActive
                      ? formatElapsed(elapsed)
                      : formatHours(task.tracked_hours ?? 0)}
                  </button>
                );
              })()}

              {/* Deliver / Reopen button */}
              {myDoneRow ? (
                // A responsible who already delivered can always reopen their part.
                <button
                  onClick={handleReopenMyPart}
                  title="Reabrir sua parte — a fila volta para você e os próximos são avisados que precisam esperar mais"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border bg-green-100 text-green-700 border-green-200 hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300"
                >
                  <RotateCcw size={12} />
                  Reabrir minha parte
                </button>
              ) : isDelivered ? (
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
              ) : queueRemaining > 0 && !isParallel ? (
                // Fila SEQUENCIAL → só o responsável atual entrega a sua parte.
                isActiveResponsible ? (
                  <button
                    onClick={() => openDeliveryDialog("part")}
                    title="Concluir sua parte (abre o popup de entrega) e passar para o próximo da fila"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-brand-teal/50 text-brand-teal hover:bg-brand-teal/5 transition-all"
                  >
                    <CheckCircle2 size={12} />
                    {queueRemaining <= 1 ? "Entregar (última parte)" : "Entregar minha parte"}
                  </button>
                ) : (
                  <span className="text-[11px] text-neutral-400 px-1" title="Apenas o responsável atual da fila pode entregar a parte">
                    Aguardando o responsável atual
                  </span>
                )
              ) : (
                <button
                  onClick={canActOnTask ? () => { setDeliverBlockedWarning(false); openDeliveryDialog("full"); } : undefined}
                  title={!canActOnTask ? "Somente o responsável pode entregar" : approvalBlockStatus === "adjustment" ? "Aprovação pediu ajustes — corrija e solicite nova aprovação" : approvalBlockStatus === "rejected" ? "Aprovação reprovada — solicite nova aprovação" : approvalBlockStatus === "pending" ? "Aprovação pendente — a entrega ficará parcial até ser aprovada" : undefined}
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
                {queue.length > 0 ? (
                  // Queue drives responsibles: show them in order (done = B&W + check)
                  queue.map((q) => {
                    const p = orgProfiles.find((x) => x.id === q.user_id);
                    const nm = p?.full_name ?? q.user_id.slice(0, 8);
                    const done = q.status === "done";
                    const active = q.status === "active";
                    return (
                      <div key={q.id} className="relative" title={`${nm}${done ? " — entregou" : active ? " — responsável atual" : " — na fila"}`}>
                        <Avatar className={cn("w-6 h-6 border-2", active ? "border-brand-teal" : "border-white", done && "grayscale opacity-70")}>
                          <AvatarImage src={p?.avatar_url ?? undefined} className={cn(done && "grayscale")} />
                          <AvatarFallback className={cn("text-[9px]", done ? "bg-neutral-200 text-neutral-500" : "bg-brand-navy/10 text-brand-navy")}>
                            {getInitials(nm)}
                          </AvatarFallback>
                        </Avatar>
                        {done && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white border border-neutral-200 flex items-center justify-center">
                            <Check size={8} className="text-neutral-500" />
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : task.assignees ? (
                  task.assignees.map((a: any) => (
                    <Avatar key={a.user_id} className={cn("w-6 h-6 border-2", a.delivered_at ? "border-brand-teal" : "border-white")}>
                      <AvatarImage src={a.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                        {getInitials(a.profile?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  ))
                ) : task.assignee ? (
                  <Avatar className="w-6 h-6 border-2 border-white">
                    <AvatarImage src={task.assignee.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                      {getInitials(task.assignee.full_name)}
                    </AvatarFallback>
                  </Avatar>
                ) : null}
                {canEditCard && queue.length === 0 && (
                  <button
                    onClick={() => setHeaderAssigneeOpen((v) => !v)}
                    title="Gerenciar responsável"
                    className="w-6 h-6 rounded-full border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                )}
                {queue.length === 0 && headerAssigneeOpen && (
                  <div className="absolute top-8 right-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 min-w-[190px]">
                    <div className="px-2 pb-1 pt-0.5">
                      <input autoFocus value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)}
                        placeholder="Buscar membro..." className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1.5 outline-none focus:border-brand-teal" />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                    {orgProfilesMeFirst.filter((m) => (m.full_name ?? "").toLowerCase().includes(assigneeSearch.toLowerCase())).map((m) => {
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
                          <span className="flex-1 text-left">{m.full_name ?? m.id}{m.id === user?.id ? " (você)" : ""}</span>
                          {isSelected && <Check size={11} className="shrink-0" />}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>

              {/* Urgent flag — kept in sync with the "Urgente" priority */}
              <button
                onClick={() => {
                  const next = !(task as any).is_urgent;
                  handleFieldUpdate("is_urgent", String(next));
                  if (next) handleFieldUpdate("priority", "urgent");
                  else if (task.priority === "urgent") handleFieldUpdate("priority", "medium");
                }}
                title={(task as any).is_urgent ? "Remover urgência" : "Marcar como urgente"}
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
                readOnly={!canEditCard}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                onBlur={(e) => canEditCard && handleFieldUpdate("title", e.target.value)}
                className="w-full text-xl font-bold text-brand-navy resize-none outline-none bg-transparent leading-snug mb-2"
                rows={2}
              />

              <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-400">
                <span>#{taskId.slice(0, 8).toUpperCase()}</span>
                <span>·</span>
                <span>
                  Criado em {formatDateFull(task.created_at)}
                  {(task as any).created_by && (() => {
                    const creator = orgProfiles.find((p) => p.id === (task as any).created_by);
                    return creator ? ` por ${creator.full_name ?? "—"}` : "";
                  })()}
                </span>

                {/* Priority select */}
                <Select
                  value={task.priority}
                  onValueChange={(v) => {
                    if (!v) return;
                    handleFieldUpdate("priority", v);
                    handleFieldUpdate("is_urgent", v === "urgent" ? "true" : "false");
                  }}
                >
                  <SelectTrigger className="h-6 w-auto text-xs border-neutral-200 gap-1 px-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                    <span>{PRIORITY_LABELS[task.priority]}</span>
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

                {/* Entrega estacionada — aguardando aprovação */}
                {parkedDelivery && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <Clock size={15} className="text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-blue-700">Parcialmente entregue — aguardando aprovação</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">
                        A entrega foi registrada, mas só será concretizada quando a aprovação for aprovada.
                        Se for reprovada ou pedir ajuste, a entrega é cancelada e você precisa refazer.
                      </p>
                    </div>
                  </div>
                )}

                {/* Delivery blocked — aprovação reprovada / pediu ajuste */}
                {deliverBlockedWarning && (approvalBlockStatus === "adjustment" || approvalBlockStatus === "rejected") && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-700">Não é possível entregar</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        {approvalBlockStatus === "adjustment"
                          ? "A aprovação pediu ajustes. Faça as correções e solicite uma nova aprovação antes de entregar."
                          : "A aprovação foi reprovada. Solicite uma nova aprovação antes de entregar."}
                      </p>
                    </div>
                    <button onClick={() => setDeliverBlockedWarning(false)} className="text-amber-400 hover:text-amber-600 shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                )}

                {/* DESCRIPTION */}
                {activeTab === "description" && (
                  <RichTextEditor
                    content={task.description ?? ""}
                    onBlur={(html) => handleFieldUpdate("description", html)}
                    placeholder="Adicionar descrição detalhada..."
                    editable={canEditCard}
                  />
                )}

                {/* COMMENTS */}
                {activeTab === "comments" && <CommentList taskId={taskId} taskTitle={task.title} />}

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
                        onClick={() => window.dispatchEvent(new CustomEvent("open-create-subtask", {
                          detail: {
                            projectId: task.project_id,
                            columnId: task.column_id,
                            parentTaskId: taskId,
                            parentTitle: task.title,
                            parentSubprojectId: (task as any).board_subproject_id ?? null,
                          },
                        }))}
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
                                    href={file.downloadUrl ?? file.dataUrl}
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
                {activeTab === "rules" && (
                  <RulesTab
                    taskId={taskId}
                    onQueueChange={async () => {
                      await loadQueue();
                      const t = await taskService.get(taskId);
                      if (t) setTask(t);
                    }}
                  />
                )}

                {activeTab === "history" && <HistoryTab taskId={taskId} columns={boardColumns} orgProfiles={orgProfiles} />}
              </div>

              {/* ── Metadata sidebar ──────────────────────────────── */}
              <div className="w-72 shrink-0 border-l border-neutral-100 overflow-y-auto p-4 space-y-4 bg-neutral-50/40">

                {/* Tarefa entregue — no TOPO do painel, visível assim que abre a task */}
                {showDeliveryBox && (
                  <div className="rounded-xl border border-green-200 bg-green-50/60 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                      <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">Tarefa entregue</span>
                    </div>

                    {/* Tempo total + data da entrega */}
                    <div className="flex items-center gap-3 text-xs text-neutral-700 flex-wrap">
                      <span className="flex items-center gap-1"><Clock size={11} className="text-green-600" /> {formatHms(trackedHours)}</span>
                      {deliveryDate && <span className="text-neutral-500">Entregue em {fmtBrDate(deliveryDate)}</span>}
                    </div>

                    {doneParts.length > 0 ? (
                      // Multi-responsável: entrega de cada um, claramente separada
                      <div className="space-y-2">
                        {doneParts.map((q) => {
                          const p = orgProfiles.find((x) => x.id === q.user_id);
                          const nm = p?.full_name ?? q.user_id.slice(0, 8);
                          return (
                            <div key={q.id} className="rounded-lg border border-green-100 bg-white/70 p-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Avatar className="w-4 h-4">
                                    <AvatarImage src={p?.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">{getInitials(nm)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs font-medium text-neutral-700 truncate">{nm}</span>
                                </div>
                                <span className="text-[10px] text-neutral-500 shrink-0 flex items-center gap-2">
                                  <span className="flex items-center gap-0.5"><Clock size={9} /> {formatHms(q.hours_spent ?? 0)}</span>
                                  {q.delivered_at && <span>{fmtBrDate(q.delivered_at)}</span>}
                                </span>
                              </div>
                              {q.delivery_note && <p className="text-[11px] text-neutral-600 leading-snug">{q.delivery_note}</p>}
                              {q.delivery_link && (
                                <a href={q.delivery_link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-teal hover:underline break-all flex items-center gap-1">
                                  <Link2 size={10} className="shrink-0" />{q.delivery_link}
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Responsável único
                      <>
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
                      </>
                    )}
                  </div>
                )}

                {/* Responsáveis / Alocados */}
                <MetaField label="Responsáveis" icon={<Users size={12} />}>
                  {queue.length > 0 && !isParallel ? (
                    // FILA SEQUENCIAL (montada na aba Regras) — somente leitura aqui.
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {queue.map((q) => {
                          const p = orgProfiles.find((x) => x.id === q.user_id);
                          const nm = p?.full_name ?? q.user_id.slice(0, 8);
                          const done = q.status === "done";
                          const active = q.status === "active";
                          return (
                            <div
                              key={q.id}
                              className="relative"
                              title={`${nm}${done ? " — entregou sua parte" : active ? " — responsável atual" : " — na fila"}`}
                            >
                              <Avatar className={cn("w-6 h-6 border-2", active ? "border-brand-teal" : "border-white", done && "grayscale opacity-70")}>
                                <AvatarImage src={p?.avatar_url ?? undefined} className={cn(done && "grayscale")} />
                                <AvatarFallback className={cn("text-[9px] font-bold", done ? "bg-neutral-200 text-neutral-500" : "bg-brand-teal/20 text-brand-teal")}>
                                  {getInitials(nm)}
                                </AvatarFallback>
                              </Avatar>
                              {done && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white border border-neutral-200 flex items-center justify-center">
                                  <Check size={8} className="text-neutral-500" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Lock size={9} /> Fila sequencial — ajuste na aba Regras
                      </p>
                    </div>
                  ) : (
                  // Editável: 1 responsável OU vários em PARALELO (2+ = paralelo, entrega única).
                  <div className="flex flex-wrap gap-1 items-center relative" ref={assigneePickerRef}>
                    {selectedResponsibleIds.length > 0 ? selectedResponsibleIds.map((id) => {
                      const name = orgProfiles.find((p) => p.id === id)?.full_name ?? id;
                      return (
                        <div
                          key={id}
                          className={cn(
                            "flex items-center gap-1 bg-white border border-neutral-200 rounded-full px-2 py-0.5",
                            canEditCard ? "cursor-pointer hover:border-destructive/40 group" : "cursor-default"
                          )}
                          title={canEditCard ? "Clique para remover" : undefined}
                          onClick={() => canEditCard && handleResponsiblesChange(selectedResponsibleIds.filter((x) => x !== id))}
                        >
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-[8px] bg-brand-teal/20 text-brand-teal">{getInitials(name)}</AvatarFallback>
                          </Avatar>
                          <span className={cn("text-[10px] text-neutral-600", canEditCard && "group-hover:text-destructive")}>{name}</span>
                        </div>
                      );
                    }) : (
                      <span className="text-[10px] text-neutral-400 italic">Sem responsável</span>
                    )}
                    {canEditCard && (
                      <button
                        onClick={() => setAssigneePickerOpen((v) => !v)}
                        title="Adicionar responsável (2+ = paralelo)"
                        className="w-5 h-5 rounded-full border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    )}
                    {selectedResponsibleIds.length >= 2 && (
                      <p className="w-full text-[10px] text-brand-teal flex items-center gap-1">
                        <Users size={9} /> Modo paralelo — todos responsáveis juntos, entrega única
                      </p>
                    )}
                    {assigneePickerOpen && (
                      <div className="absolute top-7 left-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 min-w-[190px]">
                        <div className="px-2 pb-1 pt-0.5">
                          <input autoFocus value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Buscar membro..." className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1.5 outline-none focus:border-brand-teal" />
                        </div>
                        <p className="px-3 pt-0.5 pb-1 text-[10px] text-neutral-400">Selecione um ou vários (vários = paralelo)</p>
                        <div className="max-h-52 overflow-y-auto">
                        {orgProfilesMeFirst.filter((m) => (m.full_name ?? "").toLowerCase().includes(assigneeSearch.toLowerCase())).map((m) => {
                          const isSelected = selectedResponsibleIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                const next = isSelected
                                  ? selectedResponsibleIds.filter((x) => x !== m.id)
                                  : [...selectedResponsibleIds, m.id];
                                handleResponsiblesChange(next);
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
                              <span className="flex-1 text-left">{m.full_name ?? m.id}{m.id === user?.id ? " (você)" : ""}</span>
                              {isSelected && <Check size={11} className="shrink-0" />}
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </MetaField>

                {/* Tipo de tarefa (por quadro) */}
                <MetaField label="Tipo de tarefa" icon={<ClipboardCheck size={12} />}>
                  <Select
                    value={(task as any).task_type ?? ""}
                    onValueChange={(v) => handleFieldUpdate("task_type", v || null)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <SelectValue placeholder={boardTypes.length === 0 ? "Cadastre tipos nas configurações" : "Selecionar..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {boardTypes.map((t) => (
                        <SelectItem key={t.id} value={t.name} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                            {t.name}
                          </span>
                        </SelectItem>
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
                      disabled={!canChangeStage}
                      onValueChange={(v) => {
                        if (!v || v === task.column_id) return;
                        setTask((t) => (t ? { ...t, column_id: v } : t));
                        store.moveTask(taskId, v, (task as any).position ?? 1000);
                        taskService.update(taskId, { column_id: v } as any)
                          .then(() => runAutomations({ type: "stage_entered" }, taskId))
                          .catch(() => {});
                      }}
                    >
                      <SelectTrigger className={cn("h-7 text-xs border-neutral-200", !canChangeStage && "opacity-60 cursor-not-allowed")} title={!canChangeStage ? "Somente um responsável da tarefa pode mudar a etapa" : undefined}>
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
                  {boardProjects.length > 0 ? (
                    <select
                      disabled={!canEditCard}
                      value={(task as any).board_subproject_id ?? ""}
                      onChange={(e) => {
                        if (!canEditCard) return;
                        const v = e.target.value || null;
                        setTask((t) => t ? { ...t, board_subproject_id: v } as TaskWithRelations : t);
                        store.updateTask(taskId, { board_subproject_id: v } as any);
                        taskService.update(taskId, { board_subproject_id: v } as any).catch(() => {});
                      }}
                      className="text-xs border border-neutral-200 rounded-md px-2 py-1 w-full bg-white outline-none focus:border-brand-teal disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">— Sem projeto —</option>
                      {boardProjects.map((p) => (
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

                {/* Tempo estimado — H : M : S */}
                <MetaField label="Tempo estimado" icon={<Clock size={12} />}>
                  <div className="space-y-1.5">
                    {editingEstimatedHours ? (() => {
                      const commit = () => {
                        const hours = estimatedParts.h + estimatedParts.m / 60 + estimatedParts.s / 3600;
                        handleFieldUpdate("estimated_hours", hours > 0 ? String(hours) : null);
                        setEditingEstimatedHours(false);
                      };
                      const cell = "w-full text-xs text-center border border-brand-teal rounded-md px-1 py-1 bg-white outline-none focus:ring-1 focus:ring-brand-teal/30";
                      return (
                        <div
                          className="flex items-center gap-1"
                          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commit(); }
                            if (e.key === "Escape") setEditingEstimatedHours(false);
                          }}
                        >
                          <div className="flex-1">
                            <input autoFocus type="number" min={0} value={estimatedParts.h || ""} placeholder="0"
                              onChange={(e) => setEstimatedParts((p) => ({ ...p, h: parseInt(e.target.value) || 0 }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">h</p>
                          </div>
                          <span className="text-neutral-300 pb-3">:</span>
                          <div className="flex-1">
                            <input type="number" min={0} max={59} value={estimatedParts.m || ""} placeholder="00"
                              onChange={(e) => setEstimatedParts((p) => ({ ...p, m: Math.min(59, parseInt(e.target.value) || 0) }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">min</p>
                          </div>
                          <span className="text-neutral-300 pb-3">:</span>
                          <div className="flex-1">
                            <input type="number" min={0} max={59} value={estimatedParts.s || ""} placeholder="00"
                              onChange={(e) => setEstimatedParts((p) => ({ ...p, s: Math.min(59, parseInt(e.target.value) || 0) }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">seg</p>
                          </div>
                        </div>
                      );
                    })() : (
                      <button
                        onClick={() => {
                          const total = Math.round(estimatedHours * 3600);
                          setEstimatedParts({ h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 });
                          setEditingEstimatedHours(true);
                        }}
                        className="group flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:text-brand-teal transition-colors"
                        title="Clique para editar o tempo estimado"
                      >
                        {formatHms(estimatedHours)}
                        <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                      </button>
                    )}
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
                    {editingTrackedHours ? (() => {
                      const commit = () => {
                        handleTrackedHoursUpdate(trackedParts.h + trackedParts.m / 60 + trackedParts.s / 3600);
                        setEditingTrackedHours(false);
                      };
                      const cell = "w-full text-xs text-center border border-brand-teal rounded-md px-1 py-1 bg-white outline-none focus:ring-1 focus:ring-brand-teal/30";
                      return (
                        <div
                          className="flex items-center gap-1"
                          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commit(); }
                            if (e.key === "Escape") setEditingTrackedHours(false);
                          }}
                        >
                          <div className="flex-1">
                            <input autoFocus type="number" min={0} value={trackedParts.h || ""} placeholder="0"
                              onChange={(e) => setTrackedParts((p) => ({ ...p, h: parseInt(e.target.value) || 0 }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">h</p>
                          </div>
                          <span className="text-neutral-300 pb-3">:</span>
                          <div className="flex-1">
                            <input type="number" min={0} max={59} value={trackedParts.m || ""} placeholder="00"
                              onChange={(e) => setTrackedParts((p) => ({ ...p, m: Math.min(59, parseInt(e.target.value) || 0) }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">min</p>
                          </div>
                          <span className="text-neutral-300 pb-3">:</span>
                          <div className="flex-1">
                            <input type="number" min={0} max={59} value={trackedParts.s || ""} placeholder="00"
                              onChange={(e) => setTrackedParts((p) => ({ ...p, s: Math.min(59, parseInt(e.target.value) || 0) }))} className={cell} />
                            <p className="text-[9px] text-neutral-400 text-center mt-0.5">seg</p>
                          </div>
                        </div>
                      );
                    })() : task.assignee_id === user?.id ? (
                      <button
                        onClick={() => {
                          const total = Math.round(trackedHours * 3600);
                          setTrackedParts({ h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 });
                          setEditingTrackedHours(true);
                        }}
                        className="group flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:text-brand-teal transition-colors"
                        title="Clique para editar o tempo registrado"
                      >
                        {formatHms(trackedHours)}
                        <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-brand-navy" title="Somente o responsável atual pode registrar tempo">
                        {formatHms(trackedHours)}
                      </span>
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
                    onValueChange={(v) => {
                      if (!v) return;
                      handleFieldUpdate("priority", v);
                      handleFieldUpdate("is_urgent", v === "urgent" ? "true" : "false");
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                        <span>{PRIORITY_LABELS[task.priority]}</span>
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
                    value={(task as any).requesting_area_id ?? ""}
                    onValueChange={(v) => handleFieldUpdate("requesting_area_id", v || null)}
                  >
                    <SelectTrigger className="h-7 text-xs border-neutral-200">
                      <span className={cn("truncate", !(task as any).requesting_area_id && "text-neutral-400")}>
                        {areas.find((a) => a.id === (task as any).requesting_area_id)?.name
                          ?? (areas.length === 0 ? "Nenhuma área cadastrada" : "Selecionar...")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                {/* Repetição */}
                <MetaField label="Repetição" icon={<Repeat size={12} />}>
                  {(() => {
                    const rc = (task as any).recurrence_config;
                    const recur = !rc ? null : (typeof rc === "string"
                      ? { frequency: rc, until: null as string | null }
                      : (rc as { frequency: string; until: string | null }));
                    return (
                      <div className="space-y-2">
                        <Select
                          value={recur?.frequency ?? "none"}
                          onValueChange={(v) =>
                            !v || v === "none"
                              ? saveRecurrence(null)
                              : saveRecurrence({ frequency: v, until: recur?.until ?? null, active: true, next_run: computeNextRun(v) })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs border-neutral-200">
                            <SelectValue placeholder="Sem repetição" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs">Sem repetição</SelectItem>
                            <SelectItem value="daily" className="text-xs">Diária</SelectItem>
                            <SelectItem value="weekly" className="text-xs">Semanal</SelectItem>
                            <SelectItem value="biweekly" className="text-xs">Quinzenal</SelectItem>
                            <SelectItem value="monthly" className="text-xs">Mensal</SelectItem>
                          </SelectContent>
                        </Select>

                        {recur && (
                          <div className="space-y-1.5 rounded-lg bg-neutral-50 border border-neutral-100 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Repetir até</p>
                            <label className="flex items-center gap-2 text-[11px] text-neutral-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!recur.until}
                                onChange={(e) =>
                                  saveRecurrence({ frequency: recur.frequency, active: true, next_run: computeNextRun(recur.frequency),
                                    until: e.target.checked ? null : new Date().toISOString().slice(0, 10) })
                                }
                                className="w-3 h-3 accent-brand-teal"
                              />
                              Tempo indeterminado
                            </label>
                            {recur.until != null && (
                              <input
                                type="date"
                                value={recur.until}
                                onChange={(e) =>
                                  saveRecurrence({ frequency: recur.frequency, active: true, next_run: computeNextRun(recur.frequency), until: e.target.value || null })
                                }
                                className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1 bg-white outline-none focus:border-brand-teal"
                              />
                            )}
                            <button
                              onClick={() => saveRecurrence(null)}
                              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-destructive border border-destructive/20 rounded-md py-1 hover:bg-destructive/5 transition-colors"
                            >
                              <X size={11} /> Parar repetição
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </MetaField>

                {/* Seguidores */}
                <MetaField label="Seguidores" icon={<UserPlus size={12} />}>
                  <div className="flex flex-wrap gap-1 items-center relative" ref={followersRef}>
                    <div className="flex -space-x-1.5">
                      {followers.map((id) => {
                        const p = orgProfiles.find((x) => x.id === id);
                        const name = p?.full_name ?? id;
                        return (
                          <Avatar key={id} className="w-5 h-5 border-2 border-white" title={name}>
                            <AvatarImage src={p?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">{getInitials(name)}</AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setFollowersOpen((v) => !v)}
                      title="Gerenciar seguidores"
                      className="w-5 h-5 rounded-full border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 hover:border-brand-teal hover:text-brand-teal transition-colors"
                    >
                      <Plus size={10} />
                    </button>
                    {followers.length === 0 && <span className="text-[11px] text-neutral-400">Nenhum seguidor</span>}
                    {followersOpen && (
                      <div className="absolute top-7 left-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 min-w-[190px]">
                        <div className="px-2 pb-1 pt-0.5">
                          <input autoFocus value={followerSearch} onChange={(e) => setFollowerSearch(e.target.value)}
                            placeholder="Buscar membro..." className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1.5 outline-none focus:border-brand-teal" />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                        {orgProfiles.length === 0 && <p className="px-3 py-1.5 text-xs text-neutral-400">Carregando membros...</p>}
                        {orgProfilesMeFirst.filter((m) => (m.full_name ?? "").toLowerCase().includes(followerSearch.toLowerCase())).map((m) => {
                          const isSelected = followers.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleFollower(m.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 transition-colors",
                                isSelected && "text-brand-teal font-semibold"
                              )}
                            >
                              <Avatar className="w-5 h-5 shrink-0">
                                <AvatarImage src={m.avatar_url ?? undefined} />
                                <AvatarFallback className="text-[8px] bg-brand-teal/15 text-brand-teal font-bold">{getInitials(m.full_name)}</AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-left">{m.full_name ?? m.id}{m.id === user?.id ? " (você)" : ""}</span>
                              {isSelected && <Check size={11} className="shrink-0" />}
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    )}
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

                {/* Tags (por quadro) */}
                <MetaField label="Tags" icon={<TagIcon size={12} />}>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1 items-center">
                      {task.labels?.map((l) => (
                        <span
                          key={l.id}
                          className="group/tag flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: `${l.color}20`, color: l.color }}
                        >
                          {l.name}
                          <button onClick={() => handleRemoveTag(l.id)} className="opacity-60 hover:opacity-100">
                            <X size={9} />
                          </button>
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
                          className="text-[10px] border border-brand-teal/60 rounded-full px-2 py-0.5 outline-none bg-white w-24"
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
                    {/* Existing board tags not yet applied — quick add */}
                    {boardLabels.filter((bl) => !(task.labels ?? []).some((l: any) => l.id === bl.id)).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {boardLabels
                          .filter((bl) => !(task.labels ?? []).some((l: any) => l.id === bl.id))
                          .map((bl) => (
                            <button
                              key={bl.id}
                              onClick={async () => {
                                if (!canEditCard) return;
                                await tagsService.attach(taskId, bl.id);
                                setTask((t) => (t ? { ...t, labels: [...(t.labels ?? []), bl as any] } : t));
                                store.updateTask(taskId, { labels: [...((task.labels as any[]) ?? []), bl] } as any);
                              }}
                              className="px-1.5 py-0.5 rounded-full text-[10px] border border-dashed border-neutral-200 text-neutral-400 hover:text-brand-teal hover:border-brand-teal transition-colors"
                            >
                              + {bl.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </MetaField>

              </div>
            </div>

            {/* ── Footer ────────────────────────────────────────────── */}
            <div className="px-5 py-3 border-t border-neutral-100 flex justify-between items-center shrink-0 bg-white">
              <button
                onClick={() => setDeleteConfirm(true)}
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
                  Excluir <span className="font-medium text-neutral-700">"{task.title}"</span>? Ela vai para a <span className="font-medium text-neutral-700">Lixeira</span> do quadro e pode ser recuperada por <span className="font-medium text-neutral-700">7 dias</span>.
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
                  {estimatedHours > 0 && (
                    <span className="text-xs text-neutral-400">
                      Estimado: <span className="font-medium text-neutral-600">{estimatedHours}h</span>
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
                  const estimated = estimatedHours;
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
                  const opts = { hours: totalSec / 3600, link: deliveryLink.trim(), note: deliveryNote.trim() };
                  await submitDelivery(deliveryMode, opts);
                }}
                className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                {deliveryMode === "part" && queueRemaining > 1 ? "Entregar minha parte" : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de entrega estacionada (há aprovação pendente) */}
      {parkConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setParkConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Clock size={18} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-brand-navy">Há uma aprovação pendente</h3>
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                    Sua entrega ficará <strong>registrada como parcial</strong> e só será concretizada
                    quando a aprovação for <strong>aprovada</strong>. Se for reprovada ou pedir ajuste,
                    a entrega é cancelada e você precisará refazer. Deseja continuar?
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6">
              <button
                onClick={() => setParkConfirm(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPark}
                className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Registrar entrega parcial
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
              href={file.downloadUrl ?? file.dataUrl}
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
                href={file.downloadUrl ?? file.dataUrl}
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
                Preview não disponível para este arquivo.
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
  // Native date picker (calendar). Value is stored/emitted as YYYY-MM-DD.
  const dateVal = value ? value.slice(0, 10) : "";
  return (
    <input
      type="date"
      value={dateVal}
      onChange={(e) => onChange(e.target.value || null)}
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





// ── Histórico da tarefa ──────────────────────────────────────────────────────
const STATUS_LABELS_PT: Record<string, string> = {
  open: "Aberta", in_progress: "Em andamento", delivered: "Entregue", archived: "Arquivada",
};
const PRIORITY_LABELS_PT: Record<string, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};

function prettyValue(field: string | null, value: string | null): string {
  if (value === null || value === "") return "—";
  if (field === "situacao") return STATUS_LABELS_PT[value] ?? value;
  if (field === "prioridade") return PRIORITY_LABELS_PT[value] ?? value;
  return value;
}

function HistoryTab({
  taskId,
  columns,
  orgProfiles,
}: {
  taskId: string;
  columns: { id: string; name: string }[];
  orgProfiles: Array<{ id: string; full_name: string | null }>;
}) {
  const [items, setItems] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    activityService.list(taskId).then((rows) => {
      if (!cancelled) { setItems(rows); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [taskId]);

  function resolveName(id: string | null): string {
    if (!id) return "Sistema";
    return orgProfiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);
  }

  if (loading) {
    return <p className="text-sm text-neutral-400 py-6 text-center">Carregando histórico...</p>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <History size={30} className="text-neutral-200 mb-3" />
        <p className="text-sm text-neutral-400">Nenhuma alteração registrada ainda</p>
        <p className="text-xs text-neutral-300 mt-1">Mudanças de etapa, responsável, situação e outros campos aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((a) => {
        const who = a.user_name ?? resolveName(a.user_id);
        const when = new Date(a.created_at).toLocaleString("pt-BR", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        return (
          <div key={a.id} className="flex gap-3 rounded-lg border border-neutral-100 bg-white px-3 py-2">
            <div className="w-6 h-6 rounded-full bg-brand-navy/10 flex items-center justify-center text-[9px] font-bold text-brand-navy shrink-0 mt-0.5">
              {getInitials(who)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-700">
                <span className="font-semibold text-brand-navy">{who}</span>{" "}
                <span className="text-neutral-500">{a.action.toLowerCase()}</span>
                {a.from_value !== null || a.to_value !== null ? (
                  <>
                    {": "}
                    <span className="text-neutral-400 line-through">{prettyValue(a.field, a.from_value)}</span>
                    {" → "}
                    <span className="font-medium text-neutral-700">{prettyValue(a.field, a.to_value)}</span>
                  </>
                ) : null}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{when}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
