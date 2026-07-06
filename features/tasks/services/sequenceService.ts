import { createRawClient } from "@/lib/supabase/client";

export interface SeqRow {
  id: string;
  task_id: string;
  user_id: string;
  order_position: number;
  status: "pending" | "active" | "done";
}

export const sequenceService = {
  async list(taskId: string): Promise<SeqRow[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_sequences")
      .select("id, task_id, user_id, order_position, status")
      .eq("task_id", taskId)
      .order("order_position");
    if (error) { console.error("[sequenceService.list]", error); return []; }
    return (data ?? []) as SeqRow[];
  },

  /**
   * Makes the first not-done member the "active" one, the rest (not-done)
   * "pending", and sets the task's assignee_id to that active member.
   * Returns the active user id (or null if the queue is empty / all done).
   * Call after any change to the queue (add/remove/reorder).
   */
  async syncHeadAndAssignee(taskId: string): Promise<string | null> {
    const sb = createRawClient();
    const rows = await this.list(taskId);
    if (rows.length === 0) return null; // no queue → leave assignee as-is

    const notDone = rows.filter((r) => r.status !== "done");
    const head = notDone[0] ?? null;

    // Normalize statuses
    await Promise.all(
      notDone.map((r, i) =>
        (sb as any).from("task_sequences")
          .update({ status: i === 0 ? "active" : "pending" })
          .eq("id", r.id)
      )
    );

    const assignee = head?.user_id ?? null;
    await (sb as any).from("tasks").update({ assignee_id: assignee }).eq("id", taskId);
    return assignee;
  },

  /**
   * Current member delivers their part: mark the active member done, promote the
   * next pending member to active and make them the assignee.
   * Returns { finished } — finished=true means it was the last member (caller
   * should mark the task as delivered).
   */
  async advance(taskId: string): Promise<{ finished: boolean; nextUserId: string | null }> {
    const sb = createRawClient();
    const rows = await this.list(taskId);
    const active = rows.find((r) => r.status === "active") ?? rows.find((r) => r.status !== "done");
    if (active) {
      await (sb as any).from("task_sequences").update({ status: "done" }).eq("id", active.id);
    }
    const next = rows.find((r) => r.status !== "done" && r.id !== active?.id);
    if (next) {
      await (sb as any).from("task_sequences").update({ status: "active" }).eq("id", next.id);
      await (sb as any).from("tasks").update({ assignee_id: next.user_id }).eq("id", taskId);
      return { finished: false, nextUserId: next.user_id };
    }
    return { finished: true, nextUserId: null };
  },
};
