"use client";

import { createRawClient } from "@/lib/supabase/client";
import { sequenceService } from "./sequenceService";
import { runAutomations } from "@/lib/automationEngine";
import type { DeliverPayload } from "./approvalService";

export const deliveryService = {
  /**
   * Finaliza a entrega de forma "headless" (sem depender do estado do TaskDetail).
   * Usado quando uma aprovação com entrega estacionada é APROVADA — replica o que
   * handleDeliver/handleDeliverMyPart fariam:
   *   - se há fila, avança o responsável ativo (registra a parte dele);
   *   - se ainda sobram responsáveis, passa a vez (task segue aberta);
   *   - se for o único/último, marca a task como entregue e move para "Concluído".
   * Roda no navegador do aprovador; usa createRawClient (RLS org-scoped permite).
   */
  async finalize(taskId: string, payload?: DeliverPayload | null): Promise<{ finalized: boolean }> {
    const sb = createRawClient();
    const { data: task } = await (sb as any)
      .from("tasks")
      .select("id, project_id, column_id, tracked_hours, status, position, assignment_mode")
      .eq("id", taskId)
      .maybeSingle();
    if (!task || task.status === "delivered") return { finalized: false };

    const queue = await sequenceService.list(taskId);
    const parallel = task.assignment_mode === "parallel" && queue.length >= 2;
    if (queue.length > 0 && !parallel) {
      // Fila SEQUENCIAL: registra a parte do responsável ativo e avança.
      const { finished } = await sequenceService.advance(taskId, {
        hours: payload?.hours,
        note: payload?.note ?? null,
        link: payload?.link ?? null,
      });
      // Passou a vez ao próximo responsável — a task continua aberta.
      if (!finished) return { finalized: false };
    } else if (parallel) {
      // Modo paralelo: entrega única — marca TODOS os responsáveis como entregues.
      await sequenceService.markAllDone(taskId);
    }

    // Único responsável, último da fila OU paralelo → entrega total.
    const patch: Record<string, unknown> = {
      status: "delivered",
      delivery_date: new Date().toISOString(),
    };
    // Sem fila ou paralelo, o resumo (horas/link/nota) fica no nível da task; na
    // fila sequencial cada parte guarda o seu (via sequenceService.advance).
    if (queue.length === 0 || parallel) {
      if (typeof payload?.hours === "number") patch.tracked_hours = Math.round(payload.hours * 3600) / 3600;
      if (payload?.link != null) patch.delivery_link = payload.link || null;
      if (payload?.note != null) patch.delivery_note = payload.note || null;
    }
    await (sb as any).from("tasks").update(patch).eq("id", taskId);

    // Move para a coluna de conclusão (is_done_column, senão a última por posição).
    const { data: cols } = await (sb as any)
      .from("columns")
      .select("id, name, position, is_done_column")
      .eq("project_id", task.project_id)
      .order("position");
    const list = (cols ?? []) as any[];
    const done = list.find((c) => c.is_done_column) ?? list[list.length - 1];
    if (done && done.id !== task.column_id) {
      const { data: last } = await (sb as any)
        .from("tasks")
        .select("position")
        .eq("column_id", done.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pos = (last?.position ?? 0) + 1000;
      await (sb as any).from("tasks").update({ column_id: done.id, position: pos }).eq("id", taskId);
    }

    // Dispara automações com gatilho "Tarefa entregue".
    runAutomations({ type: "task_delivered" }, taskId);
    return { finalized: true };
  },
};
