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
    // Sincronizar a fila = modo SEQUENCIAL (limpa qualquer flag "parallel" antigo).
    await (sb as any).from("tasks").update({ assignee_id: assignee, assignment_mode: "sequential" }).eq("id", taskId);
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

  /**
   * Modo PARALELO — define os responsáveis simultâneos a partir da lateral.
   * Reconcilia task_sequences com `userIds` (todos "active", sem ordem relevante),
   * aponta tasks.assignee_id para o primeiro (leituras legadas/single) e grava
   * tasks.assignment_mode.
   *  - 0/1 usuário → sem fila; volta a 'sequential' (responsável único ou nenhum).
   *  - 2+ usuários → 'parallel', uma linha "active" por usuário.
   */
  async setSidebarResponsibles(taskId: string, userIds: string[]): Promise<void> {
    const sb = createRawClient();
    const ids = [...new Set(userIds.filter(Boolean))];
    const rows = await this.list(taskId);

    if (ids.length <= 1) {
      if (rows.length) await (sb as any).from("task_sequences").delete().eq("task_id", taskId);
      await (sb as any).from("tasks")
        .update({ assignee_id: ids[0] ?? null, assignment_mode: "sequential" })
        .eq("id", taskId);
      return;
    }

    const tracked = await taskTrackedHours(sb, taskId);
    const have = new Map(rows.map((r) => [r.user_id, r]));
    const toRemove = rows.filter((r) => !ids.includes(r.user_id));
    if (toRemove.length) {
      await (sb as any).from("task_sequences").delete().in("id", toRemove.map((r) => r.id));
    }
    for (let i = 0; i < ids.length; i++) {
      const existing = have.get(ids[i]);
      if (existing) {
        await (sb as any).from("task_sequences").update({ status: "active", order_position: i }).eq("id", existing.id);
      } else {
        await (sb as any).from("task_sequences")
          .insert({ task_id: taskId, user_id: ids[i], order_position: i, status: "active", part_start_hours: tracked });
      }
    }
    await (sb as any).from("tasks")
      .update({ assignee_id: ids[0], assignment_mode: "parallel" })
      .eq("id", taskId);
  },

  /** Modo paralelo: entrega única — marca TODOS os responsáveis como entregues. */
  async markAllDone(taskId: string): Promise<void> {
    const sb = createRawClient();
    await (sb as any).from("task_sequences")
      .update({ status: "done", delivered_at: new Date().toISOString() })
      .eq("task_id", taskId);
  },

  /** Modo paralelo: inverso do markAllDone — reativa todos ao reabrir a task. */
  async markAllActive(taskId: string): Promise<void> {
    const sb = createRawClient();
    const tracked = await taskTrackedHours(sb, taskId);
    await (sb as any).from("task_sequences")
      .update({ status: "active", delivered_at: null, hours_spent: null, delivery_note: null, delivery_link: null, part_start_hours: tracked })
      .eq("task_id", taskId);
  },

  /**
   * A member who already delivered reopens their part. Their row becomes active
   * again (fresh baseline), everyone after them goes back to pending, and the
   * task's assignee returns to them. Returns the users who were pushed back so
   * they can be notified that they must wait longer.
   */
  async reopenFrom(taskId: string, rowId: string): Promise<{ affectedUserIds: string[] }> {
    const sb = createRawClient();
    const rows = await this.list(taskId);
    const target = rows.find((r) => r.id === rowId);
    if (!target) return { affectedUserIds: [] };
    const tracked = await taskTrackedHours(sb, taskId);

    // Reactivate the target; snapshot a new baseline and wipe its (now undone)
    // delivery so it no longer counts as delivered anywhere (e.g. the "Eu" hours).
    await (sb as any).from("task_sequences")
      .update({ status: "active", part_start_hours: tracked, delivered_at: null, hours_spent: null, delivery_note: null, delivery_link: null })
      .eq("id", rowId);

    // Everyone ordered after the target waits again. Those who had already
    // delivered get their delivery cleared too (their part is no longer done).
    const after = rows.filter((r) => r.order_position > target.order_position);
    await Promise.all(
      after.map((r) => (sb as any).from("task_sequences")
        .update(
          r.status === "done"
            ? { status: "pending", delivered_at: null, hours_spent: null, delivery_note: null, delivery_link: null }
            : { status: "pending" }
        )
        .eq("id", r.id))
    );

    await (sb as any).from("tasks").update({ assignee_id: target.user_id }).eq("id", taskId);
    return { affectedUserIds: after.map((r) => r.user_id) };
  },
};
