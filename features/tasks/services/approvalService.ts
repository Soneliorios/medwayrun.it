import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

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
    return (data ?? []) as TaskApproval[];
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

  async resolve(id: string, status: "approved" | "rejected" | "adjustment", comment: string | null): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("task_approvals")
      .update({ status, comment, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { console.error("[approvalService.resolve]", error); return false; }
    return true;
  },
};
