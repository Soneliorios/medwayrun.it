import { createRawClient } from "@/lib/supabase/client";

export interface SeqRow {
  id: string;
  task_id: string;
  user_id: string;
  order_position: number;
  status: "pending" | "active" | "done";
  part_start_hours?: number;
  hours_spent?: number | null;
  delivered_at?: string | null;
  delivery_note?: string | null;
  delivery_link?: string | null;
}

async function taskTrackedHours(sb: any, taskId: string): Promise<number> {
  const { data } = await sb.from("tasks").select("tracked_hours").eq("id", taskId).maybeSingle();
  return (data?.tracked_hours as number) ?? 0;
}

export const sequenceService = {
  async list(taskId: string): Promise<SeqRow[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_sequences")
      .select("id, task_id, user_id, order_position, status, part_start_hours, hours_spent, delivered_at, delivery_note, delivery_link")
      .eq("task_id", taskId)
      .order("order_position");
    if (error) { console.error("[sequenceService.list]", error); return []; }
    return (data ?? []) as SeqRow[];
  },

  /**
   * Makes the first not-done member the "active" one, the rest (not-done)
   * "pending", and sets the task's assignee_id to that active member.
   * When a member newly becomes active, snapshots the task's tracked_hours as
   * its part baseline (so the part's delta can be computed on delivery).
   */
  async syncHeadAndAssignee(taskId: string): Promise<string | null> {
    const sb = createRawClient();
    const rows = await this.list(taskId);

    if (rows.length === 0) {
      await (sb as any).from("tasks").update({ assignee_id: null }).eq("id", taskId);
      return null;
    }

    const notDone = rows.filter((r) => r.status !== "done");
    const head = notDone[0] ?? null;
    const tracked = await taskTrackedHours(sb, taskId);

    await Promise.all(
      notDone.map((r, i) => {
        const patch: Record<string, unknown> = { status: i === 0 ? "active" : "pending" };
        // Snapshot baseline only when the head is newly becoming active
        if (i === 0 && r.status !== "active") patch.part_start_hours = tracked;
        return (sb as any).from("task_sequences").update(patch).eq("id", r.id);
      })
    );

    const assignee = head?.user_id ?? null;
    await (sb as any).from("tasks").update({ assignee_id: assignee }).eq("id", taskId);
    return assignee;
  },

  /**
   * Current member delivers their part. Records what they delivered + the time
   * spent on their part (delta), marks them done, promotes the next member
   * (snapshotting their baseline) and hands them the task.
   */
  async advance(
    taskId: string,
    part?: { hours?: number; note?: string | null; link?: string | null }
  ): Promise<{ finished: boolean; nextUserId: string | null }> {
    const sb = createRawClient();
    const rows = await this.list(taskId);
    const active = rows.find((r) => r.status === "active") ?? rows.find((r) => r.status !== "done");
    const tracked = await taskTrackedHours(sb, taskId);

    if (active) {
      const autoDelta = Math.max(0, tracked - (active.part_start_hours ?? 0));
      await (sb as any).from("task_sequences").update({
        status: "done",
        delivered_at: new Date().toISOString(),
        hours_spent: part?.hours ?? autoDelta,
        delivery_note: part?.note ?? null,
        delivery_link: part?.link ?? null,
      }).eq("id", active.id);
    }

    const next = rows.find((r) => r.status !== "done" && r.id !== active?.id);
    if (next) {
      await (sb as any).from("task_sequences")
        .update({ status: "active", part_start_hours: tracked })
        .eq("id", next.id);
      await (sb as any).from("tasks").update({ assignee_id: next.user_id }).eq("id", taskId);
      return { finished: false, nextUserId: next.user_id };
    }
    return { finished: true, nextUserId: null };
  },
};
