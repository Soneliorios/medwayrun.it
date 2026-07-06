"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Clock, RotateCcw, ChevronDown, Search, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgMembers } from "@/lib/useOrgMembers";

/** User ids that are team leaders, from the admin Teams config (localStorage). */
function getTeamLeaderIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("mwr_teams");
    if (!raw) return new Set();
    const teams = JSON.parse(raw) as any[];
    const ids = new Set<string>();
    teams.forEach((t) => {
      const leaders: string[] = t.leader_ids ?? (t.leader_id ? [t.leader_id] : []);
      leaders.forEach((id) => ids.add(id));
    });
    return ids;
  } catch {
    return new Set();
  }
}
import { useNotificationStore } from "@/features/notifications/store/notificationStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { approvalService, type TaskApproval } from "../services/approvalService";

type MockTaskApproval = TaskApproval;
type ApprovalStatus = "approved" | "rejected" | "adjustment";

function notify(type: "approval_requested" | "approval_resolved", content: string, taskId: string) {
  useNotificationStore.getState().addNotification({
    id: Math.random().toString(36).slice(2),
    type,
    content,
    task_id: taskId,
    from_user_id: null,
    read_at: null,
    created_at: new Date().toISOString(),
  });
}

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
  const currentUserId = useAuthStore((s) => s.profile?.id ?? null);
  const approverRef = useRef<HTMLDivElement>(null);

  const members = useOrgMembers();
  const leaderIds = useMemo(() => getTeamLeaderIds(), []);
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
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [taskId]);

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
    notify("approval_requested", `Aprovação solicitada a ${approverName}: "${taskTitle}"`, taskId);
    await reload();
  }

  async function resolve(status: ApprovalStatus) {
    if (!approval) return;
    await approvalService.resolve(approval.id, status, comment || null);
    const resolveLabel = status === "approved" ? "aprovada" : status === "rejected" ? "rejeitada" : "marcada para ajuste";
    notify("approval_resolved", `Tarefa "${taskTitle}" foi ${resolveLabel}.`, taskId);
    setComment("");
    await reload();
  }

  const pending = approval?.status === "pending";
  const canActOnIt = pending && approval?.approver_id === currentUserId;

  return (
    <div className="mb-4">
      {!approval || approval.status !== "pending" ? (
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3">
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
            <button
              onClick={request}
              disabled={!approverName}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-brand-navy text-white font-medium hover:bg-brand-navy-light disabled:opacity-50"
            >
              Solicitar aprovação
            </button>
            {approval && (
              <span className={cn("w-full mt-1 text-[11px] flex items-center gap-1.5", statusColor(approval.status))}>
                <StatusIcon status={approval.status} size={12} />
                Última: {statusLabel(approval.status)} por {nameOf(approval.approver_id)}
                {approval.comment ? ` — "${approval.comment}"` : ""}
              </span>
            )}
          </div>
          <ApprovalHistory approvals={allApprovals} nameOf={nameOf} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              {canActOnIt
                ? "Esta tarefa está aguardando sua aprovação"
                : `Aguardando aprovação de ${nameOf(approval.approver_id)}`}
            </span>
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
  const members = useOrgMembers();
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "—" : "—");

  async function reload() {
    if (!currentUserId) { setItems([]); return; }
    setItems(await approvalService.listForApprover(currentUserId));
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [currentUserId]);

  async function resolve(item: MockTaskApproval, status: ApprovalStatus) {
    await approvalService.resolve(item.id, status, comment[item.id] || null);
    const resolveLabel = status === "approved" ? "aprovada" : status === "rejected" ? "rejeitada" : "marcada para ajuste";
    notify("approval_resolved", `Tarefa "${item.task_title}" foi ${resolveLabel}.`, item.task_id);
    setComment((c) => ({ ...c, [item.id]: "" }));
    await reload();
  }

  const pending = items.filter((i) => i.status === "pending");
  const history = items.filter((i) => i.status !== "pending");

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck size={32} className="text-neutral-200 mb-3" />
        <p className="text-sm text-neutral-400">Nenhuma aprovação pendente</p>
        <p className="text-xs text-neutral-300 mt-1">Tarefas aguardando sua aprovação aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Pendentes · {pending.length}</p>
          <div className="space-y-2">
            {pending.map((item) => (
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
