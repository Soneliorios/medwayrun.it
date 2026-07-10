"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Clock, RotateCcw, ChevronDown, Search, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { teamService } from "@/lib/teamService";
import { useAuthStore } from "@/features/auth/store/authStore";
import { approvalService, type TaskApproval } from "../services/approvalService";
import { activityService } from "../services/activityService";
import { notificationService } from "@/features/notifications/services/notificationService";
import { runAutomations } from "@/lib/automationEngine";

type MockTaskApproval = TaskApproval;
type ApprovalStatus = "approved" | "rejected" | "adjustment";

const RESOLVE_LABEL: Record<ApprovalStatus, string> = {
  approved: "aprovada",
  rejected: "rejeitada",
  adjustment: "marcada para ajuste",
};
const RESOLVE_ACTION: Record<ApprovalStatus, string> = {
  approved: "Aprovou a tarefa",
  rejected: "Rejeitou a tarefa",
  adjustment: "Solicitou ajuste",
};

function statusLabel(status: MockTaskApproval["status"]) {
  if (status === "approved") return "Aprovada";
  if (status === "rejected") return "Rejeitada";
  if (status === "adjustment") return "Ajuste solicitado";
  return "Pendente";
}

function StatusIcon({ status, size = 12 }: { status: MockTaskApproval["status"]; size?: number }) {
  if (status === "approved") return <CheckCircle2 size={size} className="text-green-500 shrink-0" />;
  if (status === "rejected") return <XCircle size={size} className="text-destructive shrink-0" />;
  if (status === "adjustment") return <RotateCcw size={size} className="text-amber-500 shrink-0" />;
  return <Clock size={size} className="text-amber-400 shrink-0" />;
}

function statusColor(status: MockTaskApproval["status"]) {
  if (status === "approved") return "text-green-600";
  if (status === "rejected") return "text-destructive";
  if (status === "adjustment") return "text-amber-600";
  return "text-amber-500";
}

function ApproverOption({ name, leader, selected, onClick }: { name: string; leader?: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-neutral-50 transition-colors",
        selected && "text-brand-teal font-semibold"
      )}
    >
      {leader && <Crown size={11} className="text-amber-400 shrink-0" />}
      <span className="flex-1 truncate">{name}</span>
      {selected && <CheckCircle2 size={12} className="text-brand-teal shrink-0" />}
    </button>
  );
}

// ── History dropdown ─────────────────────────────────────────────────────────────

function ApprovalHistory({ approvals, nameOf }: { approvals: MockTaskApproval[]; nameOf: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  if (approvals.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        <ChevronDown size={11} className={cn("transition-transform duration-150", open && "rotate-180")} />
        Histórico de aprovações ({approvals.length})
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {approvals.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-neutral-100 bg-white px-2.5 py-1.5 text-[11px]">
              <StatusIcon status={a.status} size={11} />
              <span className={cn("font-medium shrink-0", statusColor(a.status))}>
                {statusLabel(a.status)}
              </span>
              <span className="text-neutral-500 shrink-0">por {nameOf(a.approver_id)}</span>
              {a.comment && (
                <span className="text-neutral-400 truncate">"{a.comment}"</span>
              )}
              <span className="ml-auto text-neutral-300 whitespace-nowrap">
                {new Date(a.resolved_at ?? a.requested_at).toLocaleDateString("pt-BR", {
                  day: "2-digit", month: "short",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Banner + approver picker inside the task detail ─────────────────────────────

export function ApprovalBanner({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const [approval, setApproval] = useState<MockTaskApproval | null>(null);
  const [allApprovals, setAllApprovals] = useState<MockTaskApproval[]>([]);
  const [approverId, setApproverId] = useState("");
  const [approverOpen, setApproverOpen] = useState(false);
  const [approverSearch, setApproverSearch] = useState("");
  const [comment, setComment] = useState("");
  // Só mostra o seletor de aprovador depois que a pessoa confirma que a tarefa
  // precisa de aprovação (pergunta "Necessita de aprovação?" → botão "Sim").
  const [needsApproval, setNeedsApproval] = useState(false);
  const currentUserId = useAuthStore((s) => s.profile?.id ?? null);
  const myName = useAuthStore((s) => s.profile?.full_name ?? null);
  const approverRef = useRef<HTMLDivElement>(null);

  const members = useOrgMembers();
  const [leaderIds, setLeaderIds] = useState<Set<string>>(new Set());
  useEffect(() => { teamService.leaderIds().then(setLeaderIds); }, []);
  const isLeader = (m: { id: string; role: string }) =>
    m.role === "owner" || m.role === "admin" || leaderIds.has(m.id);

  // Default the approver to the first leader (or first member) once loaded.
  useEffect(() => {
    if (approverId || members.length === 0) return;
    const firstLeader = members.find(isLeader);
    setApproverId((firstLeader ?? members[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const approverName = members.find((m) => m.id === approverId)?.full_name ?? "";

  // Leaders first, then everyone else — each group filtered by the search box.
  const grouped = useMemo(() => {
    const q = approverSearch.toLowerCase();
    const match = (m: typeof members[number]) => m.full_name.toLowerCase().includes(q);
    const byName = (a: typeof members[number], b: typeof members[number]) => a.full_name.localeCompare(b.full_name);
    const leaders = members.filter((m) => isLeader(m) && match(m)).sort(byName);
    const others = members.filter((m) => !isLeader(m) && match(m)).sort(byName);
    return { leaders, others };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, approverSearch, leaderIds]);

  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "—" : "—");

  async function reload() {
    const rows = await approvalService.getForTask(taskId);
    setAllApprovals(rows);
    setApproval(rows[0] ?? null);
  }
  useEffect(() => { reload(); setNeedsApproval(false); /* eslint-disable-next-line */ }, [taskId]);

  // Close approver dropdown on outside click
  useEffect(() => {
    if (!approverOpen) return;
    function h(e: MouseEvent) {
      if (approverRef.current && !approverRef.current.contains(e.target as Node)) setApproverOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [approverOpen]);

  async function request() {
    if (!approverId) return;
    await approvalService.request({ taskId, taskTitle, approverId, requestedBy: currentUserId });
    await activityService.log({
      taskId, userId: currentUserId, userName: myName,
      action: "Solicitou aprovação", field: "aprovacao", toValue: approverName,
    });
    // Notify the chosen approver
    await notificationService.create({
      userId: approverId, type: "approval_requested", taskId, fromUserId: currentUserId,
      content: `${myName ?? "Alguém"} solicitou sua aprovação em "${taskTitle}"`,
    });
    await reload();
    setNeedsApproval(false);
    // Reavalia automações (condição "tem aprovação pendente" ficou verdadeira).
    runAutomations({ type: "approval_changed" }, taskId);
  }

  // Only the person who requested the approval can revert it
  const canRevert = !!approval && !!currentUserId && approval.requested_by === currentUserId;
  async function revert() {
    if (!approval || !canRevert) return;
    if (!confirm("Reverter esta aprovação? A solicitação será removida.")) return;
    const approverId = approval.approver_id;
    await approvalService.revert(approval.id);
    await activityService.log({
      taskId, userId: currentUserId, userName: myName,
      action: "Cancelou a solicitação de aprovação",
    });
    // Let the approver know the request was withdrawn
    if (approverId) await notificationService.create({
      userId: approverId, type: "approval_resolved", taskId, fromUserId: currentUserId,
      content: `${myName ?? "Alguém"} cancelou a solicitação de aprovação de "${taskTitle}"`,
    });
    setComment("");
    await reload();
  }

  async function resolve(status: ApprovalStatus) {
    if (!approval) return;
    const requestedBy = approval.requested_by;
    const resolvedApproverId = approval.approver_id;
    await approvalService.resolve(approval.id, status, comment || null);
    await activityService.log({
      taskId, userId: currentUserId, userName: myName,
      action: RESOLVE_ACTION[status], field: "aprovacao", toValue: comment || null,
    });
    // Notify whoever requested the approval
    if (requestedBy) await notificationService.create({
      userId: requestedBy, type: "approval_resolved", taskId, fromUserId: currentUserId,
      content: `Sua solicitação em "${taskTitle}" foi ${RESOLVE_LABEL[status]} por ${myName ?? "um aprovador"}${comment ? ` — "${comment}"` : ""}`,
    });
    setComment("");
    await reload();
    // Dispara automações do resultado da aprovação (aprovada/ajuste/rejeitada).
    const evType = status === "approved" ? "task_approved" : status === "adjustment" ? "task_adjustment" : status === "rejected" ? "task_rejected" : null;
    if (evType) runAutomations({ type: evType, approverId: resolvedApproverId }, taskId);
  }

  const pending = approval?.status === "pending";
  const canActOnIt = pending && approval?.approver_id === currentUserId;

  return (
    <div className="mb-4">
      {!approval || approval.status !== "pending" ? (
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3">
          {!needsApproval ? (
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck size={14} className="text-neutral-400 shrink-0" />
              <span className="text-xs font-medium text-neutral-600">Necessita de aprovação?</span>
              <button
                onClick={() => setNeedsApproval(true)}
                className="ml-auto text-xs px-3 py-1.5 rounded-md bg-brand-navy text-white font-medium hover:bg-brand-navy-light"
              >
                Sim
              </button>
              {approval && (
                <span className={cn("w-full mt-1 text-[11px] flex items-center gap-1.5", statusColor(approval.status))}>
                  <StatusIcon status={approval.status} size={12} />
                  Última: {statusLabel(approval.status)} por {nameOf(approval.approver_id)}
                  {approval.comment ? ` — "${approval.comment}"` : ""}
                  {canRevert && (
                    <button onClick={revert} className="ml-1 flex items-center gap-1 text-neutral-400 hover:text-destructive transition-colors" title="Reverter aprovação (só quem solicitou)">
                      <RotateCcw size={11} /> Reverter
                    </button>
                  )}
                </span>
              )}
            </div>
          ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck size={14} className="text-neutral-400 shrink-0" />
            <span className="text-xs text-neutral-500">Aprovador:</span>
            <div className="relative" ref={approverRef}>
              <button
                type="button"
                onClick={() => setApproverOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs border border-neutral-200 rounded-md px-2 py-1 bg-white hover:border-brand-teal transition-colors min-w-[140px]"
              >
                <span className="flex-1 text-left truncate">{approverName || "Selecionar..."}</span>
                <ChevronDown size={12} className="text-neutral-400 shrink-0" />
              </button>
              {approverOpen && (
                <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-xl border border-neutral-200 shadow-xl z-50 py-1">
                  <div className="relative px-2 pb-1.5 pt-1">
                    <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
                    <input
                      autoFocus
                      value={approverSearch}
                      onChange={(e) => setApproverSearch(e.target.value)}
                      placeholder="Buscar aprovador..."
                      className="w-full text-xs border border-neutral-200 rounded-md pl-7 pr-2 py-1.5 outline-none focus:border-brand-teal"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {members.length === 0 && <p className="px-3 py-2 text-xs text-neutral-400">Carregando...</p>}
                    {grouped.leaders.length > 0 && (
                      <>
                        <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Liderança</p>
                        {grouped.leaders.map((m) => (
                          <ApproverOption key={m.id} name={m.full_name} leader selected={m.id === approverId}
                            onClick={() => { setApproverId(m.id); setApproverOpen(false); setApproverSearch(""); }} />
                        ))}
                      </>
                    )}
                    {grouped.others.length > 0 && (
                      <>
                        {grouped.leaders.length > 0 && <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Membros</p>}
                        {grouped.others.map((m) => (
                          <ApproverOption key={m.id} name={m.full_name} selected={m.id === approverId}
                            onClick={() => { setApproverId(m.id); setApproverOpen(false); setApproverSearch(""); }} />
                        ))}
                      </>
                    )}
                    {members.length > 0 && grouped.leaders.length === 0 && grouped.others.length === 0 && (
                      <p className="px-3 py-2 text-xs text-neutral-400">Nenhum resultado.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setNeedsApproval(false); setApproverOpen(false); }}
                className="text-xs px-2 py-1.5 rounded-md text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={request}
                disabled={!approverName}
                className="text-xs px-3 py-1.5 rounded-md bg-brand-navy text-white font-medium hover:bg-brand-navy-light disabled:opacity-50"
              >
                Solicitar aprovação
              </button>
            </div>
            {approval && (
              <span className={cn("w-full mt-1 text-[11px] flex items-center gap-1.5", statusColor(approval.status))}>
                <StatusIcon status={approval.status} size={12} />
                Última: {statusLabel(approval.status)} por {nameOf(approval.approver_id)}
                {approval.comment ? ` — "${approval.comment}"` : ""}
                {canRevert && (
                  <button onClick={revert} className="ml-1 flex items-center gap-1 text-neutral-400 hover:text-destructive transition-colors" title="Reverter aprovação (só quem solicitou)">
                    <RotateCcw size={11} /> Reverter
                  </button>
                )}
              </span>
            )}
          </div>
          )}
          <ApprovalHistory approvals={allApprovals} nameOf={nameOf} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-500" />
            <span className="text-xs font-medium text-amber-700 flex-1">
              {canActOnIt
                ? "Esta tarefa está aguardando sua aprovação"
                : `Aguardando aprovação de ${nameOf(approval.approver_id)}`}
            </span>
            {canRevert && (
              <button onClick={revert} className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-destructive transition-colors shrink-0" title="Cancelar a solicitação de aprovação">
                <RotateCcw size={11} /> Reverter
              </button>
            )}
          </div>
          {canActOnIt && (
            <>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Observação (opcional)..."
                className="w-full text-xs border border-amber-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-amber-400"
              />
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => resolve("approved")} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-green-600 text-white font-medium hover:opacity-90">
                  <CheckCircle2 size={12} /> Aprovar
                </button>
                <button onClick={() => resolve("adjustment")} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-500 text-white font-medium hover:opacity-90">
                  <RotateCcw size={12} /> Ajuste
                </button>
                <button onClick={() => resolve("rejected")} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-white font-medium hover:opacity-90">
                  <XCircle size={12} /> Rejeitar
                </button>
              </div>
            </>
          )}
          <ApprovalHistory approvals={allApprovals} nameOf={nameOf} />
        </div>
      )}
    </div>
  );
}

// ── /me → Minhas aprovações ──────────────────────────────────────────────────────

export function MyApprovals({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [items, setItems] = useState<MockTaskApproval[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});
  const currentUserId = useAuthStore((s) => s.profile?.id ?? null);
  const myName = useAuthStore((s) => s.profile?.full_name ?? null);
  const members = useOrgMembers();
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "—" : "—");

  async function reload() {
    if (!currentUserId) { setItems([]); return; }
    setItems(await approvalService.listForUser(currentUserId));
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [currentUserId]);

  // Keep the list live — new requests/resolutions show up without a refresh.
  useEffect(() => {
    if (!currentUserId) return;
    const sb = createClient();
    const channel = sb
      .channel(`my-approvals:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_approvals" }, () => reload())
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  async function resolve(item: MockTaskApproval, status: ApprovalStatus) {
    const c = comment[item.id] || null;
    await approvalService.resolve(item.id, status, c);
    await activityService.log({
      taskId: item.task_id, userId: currentUserId, userName: myName,
      action: RESOLVE_ACTION[status], field: "aprovacao", toValue: c,
    });
    if (item.requested_by) await notificationService.create({
      userId: item.requested_by, type: "approval_resolved", taskId: item.task_id, fromUserId: currentUserId,
      content: `Sua solicitação em "${item.task_title}" foi ${RESOLVE_LABEL[status]} por ${myName ?? "um aprovador"}${c ? ` — "${c}"` : ""}`,
    });
    setComment((prev) => ({ ...prev, [item.id]: "" }));
    await reload();
    const evType = status === "approved" ? "task_approved" : status === "adjustment" ? "task_adjustment" : status === "rejected" ? "task_rejected" : null;
    if (evType) runAutomations({ type: evType, approverId: item.approver_id }, item.task_id);
  }

  async function cancel(item: MockTaskApproval) {
    if (!confirm("Cancelar esta solicitação de aprovação?")) return;
    await approvalService.revert(item.id);
    await activityService.log({
      taskId: item.task_id, userId: currentUserId, userName: myName,
      action: "Cancelou a solicitação de aprovação",
    });
    if (item.approver_id) await notificationService.create({
      userId: item.approver_id, type: "approval_resolved", taskId: item.task_id, fromUserId: currentUserId,
      content: `${myName ?? "Alguém"} cancelou a solicitação de aprovação de "${item.task_title}"`,
    });
    await reload();
  }

  const toApprove = items.filter((i) => i.status === "pending" && i.approver_id === currentUserId);
  const requestedByMe = items.filter((i) => i.status === "pending" && i.requested_by === currentUserId && i.approver_id !== currentUserId);
  const history = items.filter((i) => i.status !== "pending");

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck size={32} className="text-neutral-200 mb-3" />
        <p className="text-sm text-neutral-400">Nenhuma aprovação por aqui</p>
        <p className="text-xs text-neutral-300 mt-1">Aprovações que você precisa dar ou que você solicitou aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {toApprove.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Aguardando você aprovar · {toApprove.length}</p>
          <div className="space-y-2">
            {toApprove.map((item) => (
              <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-amber-500 shrink-0" />
                  <button onClick={() => onOpenTask(item.task_id)} className="text-sm font-medium text-brand-navy hover:text-brand-teal truncate flex-1 text-left">
                    {item.task_title}
                  </button>
                  <span className="text-[10px] text-neutral-400">por {nameOf(item.requested_by)}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    value={comment[item.id] ?? ""}
                    onChange={(e) => setComment((c) => ({ ...c, [item.id]: e.target.value }))}
                    placeholder="Observação..."
                    className="flex-1 min-w-[120px] text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-brand-teal"
                  />
                  <button onClick={() => resolve(item, "approved")} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-green-600 text-white hover:opacity-90">
                    <CheckCircle2 size={12} /> Aprovar
                  </button>
                  <button onClick={() => resolve(item, "adjustment")} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-amber-500 text-white hover:opacity-90">
                    <RotateCcw size={12} /> Ajuste
                  </button>
                  <button onClick={() => resolve(item, "rejected")} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-destructive text-white hover:opacity-90">
                    <XCircle size={12} /> Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {requestedByMe.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Que você solicitou · {requestedByMe.length}</p>
          <div className="space-y-2">
            {requestedByMe.map((item) => (
              <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-amber-400 shrink-0" />
                  <button onClick={() => onOpenTask(item.task_id)} className="text-sm font-medium text-brand-navy hover:text-brand-teal truncate flex-1 text-left">
                    {item.task_title}
                  </button>
                  <span className="text-[10px] text-neutral-400">aguardando {nameOf(item.approver_id)}</span>
                  <button onClick={() => cancel(item)} className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-destructive transition-colors shrink-0" title="Cancelar solicitação">
                    <RotateCcw size={11} /> Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Histórico · {history.length}</p>
          <div className="space-y-1.5">
            {history.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-white p-2.5">
                <StatusIcon status={item.status} size={13} />
                <button onClick={() => onOpenTask(item.task_id)} className="text-sm text-neutral-700 hover:text-brand-teal truncate flex-1 text-left">
                  {item.task_title}
                </button>
                <span className={cn("text-[10px] font-medium shrink-0", statusColor(item.status))}>
                  {statusLabel(item.status)}
                </span>
                {item.comment && <span className="text-[10px] text-neutral-400 truncate max-w-[160px]">"{item.comment}"</span>}
                {item.resolved_at && (
                  <span className="text-[10px] text-neutral-300 shrink-0">
                    {new Date(item.resolved_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
