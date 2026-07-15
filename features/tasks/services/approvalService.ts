import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

/** Entrega estacionada anexada a uma aprovação (concretizada ao aprovar). */
export interface DeliverPayload {
  mode?: "full" | "part";
  hours?: number;
  note?: string | null;
  link?: string | null;
  // Quem estacionou a entrega (necessário no paralelo: entrega só a parte dele).
  userId?: string | null;
}

export interface TaskApproval {
  id: string;
  task_id: string;
  task_title: string | null;
  approver_id: string | null;
  requested_by: string | null;
  status: "pending" | "approved" | "rejected" | "adjustment";
  comment: string | null;
  requested_at: string;
  resolved_at: string | null;
  // Entrega "parcial" aguardando esta aprovação (patch supabase_delivery_on_approval.sql).
  deliver_on_approve?: boolean;
  deliver_payload?: DeliverPayload | null;
}

/**
 * Remove aprovações cujo TASK foi apagado (soft-delete deleted_at, ou hard-delete):
 * uma tarefa apagada não pode continuar aparecendo na caixa de aprovações.
 */
async function keepLiveTasks(sb: any, rows: TaskApproval[]): Promise<TaskApproval[]> {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => r.task_id).filter(Boolean))];
  const { data: live } = await sb.from("tasks").select("id").in("id", ids).is("deleted_at", null);
  const liveSet = new Set(((live ?? []) as { id: string }[]).map((t) => t.id));
  return rows.filter((r) => liveSet.has(r.task_id));
}

export const approvalService = {
  /** Latest approval + full history for a task. */
  async getForTask(taskId: string): Promise<TaskApproval[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_approvals")
      .select("*")
      .eq("task_id", taskId)
      .order("requested_at", { ascending: false });
    if (error) { console.error("[approvalService.getForTask]", error); return []; }
    return (data ?? []) as TaskApproval[];
  },

  /** Approvals assigned to a given approver. */
  async listForApprover(approverId: string): Promise<TaskApproval[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_approvals")
      .select("*")
      .eq("approver_id", approverId)
      .order("requested_at", { ascending: false });
    if (error) { console.error("[approvalService.listForApprover]", error); return []; }
    return keepLiveTasks(sb, (data ?? []) as TaskApproval[]);
  },

  /** Everything a user is involved in — as approver OR as requester. */
  async listForUser(userId: string): Promise<TaskApproval[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_approvals")
      .select("*")
      .or(`approver_id.eq.${userId},requested_by.eq.${userId}`)
      .order("requested_at", { ascending: false });
    if (error) { console.error("[approvalService.listForUser]", error); return []; }
    return keepLiveTasks(sb, (data ?? []) as TaskApproval[]);
  },

  async request(input: { taskId: string; taskTitle: string; approverId: string; requestedBy: string | null }): Promise<TaskApproval | null> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_approvals")
      .insert({
        task_id: input.taskId,
        org_id: ORG_ID,
        task_title: input.taskTitle,
        approver_id: input.approverId,
        requested_by: input.requestedBy,
        status: "pending",
      })
      .select()
      .single();
    if (error) { console.error("[approvalService.request]", error); return null; }
    return data as TaskApproval;
  },

  /** Revert/cancel an approval (removes it). Only the requester should call this. */
  async revert(id: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_approvals").delete().eq("id", id);
    if (error) { console.error("[approvalService.revert]", error); return false; }
    return true;
  },

  /**
   * Resolve uma aprovação PENDENTE. A transição é condicional (só afeta linha com
   * status "pending") e retorna true apenas se realmente transicionou — assim um
   * duplo-clique / re-disparo não roda a finalização de entrega duas vezes.
   */
  async resolve(id: string, status: "approved" | "rejected" | "adjustment", comment: string | null): Promise<boolean> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_approvals")
      .update({ status, comment, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (error) { console.error("[approvalService.resolve]", error); return false; }
    return (data?.length ?? 0) > 0;
  },

  /** Anexa uma entrega "estacionada" a esta aprovação (concretiza ao aprovar). */
  async setDeliverOnApprove(id: string, payload: DeliverPayload): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("task_approvals")
      .update({ deliver_on_approve: true, deliver_payload: payload })
      .eq("id", id);
    if (error) { console.error("[approvalService.setDeliverOnApprove]", error); return false; }
    return true;
  },

  /** Cancela a entrega estacionada (ex.: aprovação rejeitada / pediu ajuste). */
  async clearDeliverOnApprove(id: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("task_approvals")
      .update({ deliver_on_approve: false, deliver_payload: null })
      .eq("id", id);
    if (error) { console.error("[approvalService.clearDeliverOnApprove]", error); return false; }
    return true;
  },
};
