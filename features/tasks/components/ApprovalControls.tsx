"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Clock, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
type MockTaskApproval = {
  id: string; task_id: string; task_title: string;
  approver: string; requested_by: string;
  status: "pending" | "approved" | "rejected" | "adjustment";
  comment: string | null; requested_at: string; resolved_at: string | null;
};
import { useNotificationStore } from "@/features/notifications/store/notificationStore";

export const APPROVAL_USERS = ["Você (demo)", "Ana Souza", "Bruno Lima", "Carla Dias"];
export const CURRENT_USER = "Você (demo)";

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

// ── History dropdown ─────────────────────────────────────────────────────────────

function ApprovalHistory({ approvals }: { approvals: MockTaskApproval[] }) {
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
              <span className="text-neutral-500 shrink-0">por {a.approver}</span>
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
  const [approver, setApprover] = useState(APPROVAL_USERS[0]);
  const [comment, setComment] = useState("");

  function reload() {
    // No-op: approval data requires Supabase implementation
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [taskId]);

  function request() {
    notify("approval_requested", `Aprovação solicitada a ${approver}: "${taskTitle}"`, taskId);
  }

  function resolve(status: ApprovalStatus) {
    if (!approval) return;
    const resolveLabel = status === "approved" ? "aprovada" : status === "rejected" ? "rejeitada" : "marcada para ajuste";
    notify("approval_resolved", `Tarefa "${taskTitle}" foi ${resolveLabel}.`, taskId);
    setComment("");
  }

  const pending = approval?.status === "pending";
  const canActOnIt = pending && approval?.approver === CURRENT_USER;

  return (
    <div className="mb-4">
      {!approval || approval.status !== "pending" ? (
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck size={14} className="text-neutral-400 shrink-0" />
            <span className="text-xs text-neutral-500">Aprovador:</span>
            <select
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              className="text-xs border border-neutral-200 rounded-md px-2 py-1 bg-white outline-none focus:border-brand-teal"
            >
              {APPROVAL_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button
              onClick={request}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-brand-navy text-white font-medium hover:bg-brand-navy-light"
            >
              Solicitar aprovação
            </button>
            {approval && (
              <span className={cn("w-full mt-1 text-[11px] flex items-center gap-1.5", statusColor(approval.status))}>
                <StatusIcon status={approval.status} size={12} />
                Última: {statusLabel(approval.status)} por {approval.approver}
                {approval.comment ? ` — "${approval.comment}"` : ""}
              </span>
            )}
          </div>
          <ApprovalHistory approvals={allApprovals} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              {canActOnIt
                ? "Esta tarefa está aguardando sua aprovação"
                : `Aguardando aprovação de ${approval.approver}`}
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
          <ApprovalHistory approvals={allApprovals} />
        </div>
      )}
    </div>
  );
}

// ── /me → Minhas aprovações ──────────────────────────────────────────────────────

export function MyApprovals({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [items, setItems] = useState<MockTaskApproval[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});

  function reload() { /* No-op: approval data requires Supabase implementation */ }
  useEffect(() => { reload(); }, []);

  function resolve(item: MockTaskApproval, status: ApprovalStatus) {
    const resolveLabel = status === "approved" ? "aprovada" : status === "rejected" ? "rejeitada" : "marcada para ajuste";
    notify("approval_resolved", `Tarefa "${item.task_title}" foi ${resolveLabel}.`, item.task_id);
    setComment((c) => ({ ...c, [item.id]: "" }));
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
                  <span className="text-[10px] text-neutral-400">por {item.requested_by}</span>
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
