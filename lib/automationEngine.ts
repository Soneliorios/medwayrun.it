"use client";

import { createRawClient } from "@/lib/supabase/client";
import { automationService, type AutomationRow, type AutomationTrigger, type AutomationAction } from "@/lib/automationService";
import { taskService } from "@/features/tasks/services/taskService";
import { tagsService } from "@/features/tasks/services/tagsService";
import { sequenceService } from "@/features/tasks/services/sequenceService";
import { notificationService } from "@/features/notifications/services/notificationService";
import { approvalService } from "@/features/tasks/services/approvalService";
import { useBoardStore } from "@/features/board/store/boardStore";

/**
 * Motor de execução das automações (client-side, disparado pelo cliente que fez
 * a ação). Avalia os gatilhos (eventos + condições, com E/OU) e executa as ações
 * em sequência. As ações escrevem direto via serviços — NÃO re-invocam o motor —
 * então não há cascata/loop infinito (o realtime dos outros clientes só atualiza
 * o store, não dispara o motor).
 */

// Toast simples (feedback de automação, ex.: falha ao notificar no Slack).
function engineToast(message: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#0B1B3A;color:white;font-size:12px;font-weight:500;padding:10px 16px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);pointer-events:none;max-width:90vw;text-align:center;";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export type EngineEvent =
  | { type: "task_created" }
  | { type: "stage_entered" }
  | { type: "task_approved"; approverId?: string | null }
  | { type: "task_adjustment"; approverId?: string | null }
  | { type: "task_rejected"; approverId?: string | null }
  | { type: "approval_changed" } // solicitação/mudança de aprovação (para reavaliar condições)
  | { type: "task_delivered" }
  | { type: "comment_added" }
  | { type: "attachment_added" }
  | { type: "due_date_near"; days: number };

interface EngineTask {
  id: string;
  project_id: string;
  column_id: string | null;
  title: string | null;
  assignee_id: string | null;
  due_date: string | null;
  created_by: string | null;
}

interface Ctx {
  currentStageName: string;
  columns: { id: string; name: string; position: number }[];
  getApprovals: () => Promise<any[]>;
}

// Domínio de cada gatilho/evento — usado para só avaliar uma automação quando o
// evento atual é relevante para pelo menos um de seus gatilhos.
const TRIGGER_DOMAIN: Record<string, string> = {
  task_created: "create",
  stage_entered: "stage", in_stage: "stage",
  task_approved: "approval", task_adjustment: "approval", task_rejected: "approval", approval_pending: "approval",
  task_delivered: "delivery",
  comment_added: "comment",
  attachment_added: "attachment",
  due_date_near: "due",
};
const EVENT_DOMAIN: Record<EngineEvent["type"], string> = {
  task_created: "create",
  stage_entered: "stage",
  task_approved: "approval", task_adjustment: "approval", task_rejected: "approval", approval_changed: "approval",
  task_delivered: "delivery",
  comment_added: "comment",
  attachment_added: "attachment",
  due_date_near: "due",
};

const PRIORITY_MAP: Record<string, string> = { "Baixa": "low", "Média": "medium", "Alta": "high", "Urgente": "urgent" };

// ── Dedup de disparo em rajada (mesma regra+tarefa+evento) ────────────────────
const recentFires = new Map<string, number>();
function firedRecently(key: string, windowMs = 8000): boolean {
  const now = Date.now();
  const last = recentFires.get(key);
  if (last && now - last < windowMs) return true;
  recentFires.set(key, now);
  if (recentFires.size > 500) {
    for (const [k, t] of recentFires) if (now - t > windowMs) recentFires.delete(k);
  }
  return false;
}

// ── Automations cache (curto, por org) ───────────────────────────────────────
let cache: { at: number; rows: AutomationRow[] } | null = null;
export function invalidateAutomationCache() { cache = null; }
async function activeAutomations(boardId: string): Promise<AutomationRow[]> {
  if (!cache || Date.now() - cache.at > 15000) {
    cache = { at: Date.now(), rows: await automationService.list() };
  }
  return cache.rows.filter((r) => r.board_id === boardId && r.is_active);
}

async function boardColumns(boardId: string): Promise<{ id: string; name: string; position: number }[]> {
  const store = useBoardStore.getState();
  const cols = store.columns as any[];
  if (cols.length && cols[0]?.project_id === boardId) {
    return cols.map((c) => ({ id: c.id, name: c.name, position: c.position }));
  }
  const sb = createRawClient();
  const { data } = await (sb as any).from("columns").select("id, name, position, project_id").eq("project_id", boardId).order("position");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, position: c.position }));
}

async function responsibleIds(task: EngineTask): Promise<string[]> {
  const ids = new Set<string>();
  if (task.assignee_id) ids.add(task.assignee_id);
  try {
    const seq = await sequenceService.list(task.id);
    seq.forEach((r) => ids.add(r.user_id));
  } catch { /* ignore */ }
  return [...ids].filter(Boolean);
}

// ── Avaliação dos gatilhos ────────────────────────────────────────────────────
async function triggerSatisfied(trg: AutomationTrigger, ev: EngineEvent, ctx: Ctx): Promise<boolean> {
  const cfg = (trg.config ?? {}) as Record<string, any>;
  switch (trg.event) {
    // Eventos
    case "task_created": return ev.type === "task_created";
    // "entrou na etapa" casa no momento do movimento (etapa atual == config)
    case "stage_entered": return ev.type === "stage_entered" && !!cfg.stage && ctx.currentStageName === cfg.stage;
    case "task_approved": return ev.type === "task_approved" && (!cfg.approver || (ev as any).approverId === cfg.approver);
    case "task_adjustment": return ev.type === "task_adjustment" && (!cfg.approver || (ev as any).approverId === cfg.approver);
    case "task_rejected": return ev.type === "task_rejected" && (!cfg.approver || (ev as any).approverId === cfg.approver);
    case "task_delivered": return ev.type === "task_delivered";
    case "comment_added": return ev.type === "comment_added";
    case "attachment_added": return ev.type === "attachment_added";
    case "due_date_near": return ev.type === "due_date_near";
    // Condições (estado atual)
    case "in_stage": return !!cfg.stage && ctx.currentStageName === cfg.stage;
    case "approval_pending": {
      const approvals = await ctx.getApprovals();
      // Considera só a aprovação mais recente por (approver) — status "pending".
      return approvals.some((a) => a.status === "pending" && (!cfg.approver || a.approver_id === cfg.approver));
    }
    default: return false;
  }
}

async function bumpCount(auto: AutomationRow) {
  try {
    const sb = createRawClient();
    await (sb as any).from("automations").update({ execution_count: (auto.execution_count ?? 0) + 1 }).eq("id", auto.id);
    auto.execution_count = (auto.execution_count ?? 0) + 1;
  } catch (e) { console.error("[automationEngine] bumpCount", e); }
}

// ── Execução das ações ────────────────────────────────────────────────────────
async function runAction(a: AutomationAction, auto: AutomationRow, task: EngineTask, ctx: Ctx) {
  const cfg = (a.config ?? {}) as Record<string, any>;
  const sb = createRawClient();
  switch (a.type) {
    case "move_to_stage": {
      const target = ctx.columns.find((c) => c.name === cfg.stage);
      if (!target || target.id === task.column_id) return;
      // Append to the end of the target column (board positions step by ~1000).
      const { data: last } = await (sb as any)
        .from("tasks").select("position").eq("column_id", target.id).order("position", { ascending: false }).limit(1).maybeSingle();
      const pos = (last?.position ?? 0) + 1000;
      await taskService.update(task.id, { column_id: target.id, position: pos } as any);
      const store = useBoardStore.getState();
      if ((store.columns as any[])[0]?.project_id === task.project_id) store.moveTask(task.id, target.id, pos);
      task.column_id = target.id;
      return;
    }
    case "assign_user": {
      const users = (cfg.users as string[]) ?? [];
      if (!users.length) return;
      const existing = await sequenceService.list(task.id);
      const have = new Set(existing.map((r) => r.user_id));
      let pos = existing.length ? Math.max(...existing.map((r) => r.order_position ?? 0)) + 1 : 0;
      // "Alocar usuários" é aditivo: preserva o responsável direto atual (tarefas
      // sem fila) como cabeça, senão o syncHeadAndAssignee o apagaria.
      if (existing.length === 0 && task.assignee_id && !have.has(task.assignee_id)) {
        await (sb as any).from("task_sequences").insert({ task_id: task.id, user_id: task.assignee_id, order_position: pos++, status: "pending" });
        have.add(task.assignee_id);
      }
      for (const u of users) {
        if (have.has(u)) continue;
        await (sb as any).from("task_sequences").insert({ task_id: task.id, user_id: u, order_position: pos++, status: "pending" });
      }
      await sequenceService.syncHeadAndAssignee(task.id);
      return;
    }
    case "remove_assignee": {
      await (sb as any).from("task_sequences").delete().eq("task_id", task.id);
      await taskService.update(task.id, { assignee_id: null } as any);
      task.assignee_id = null;
      return;
    }
    case "add_tag": {
      if (!cfg.tag) return;
      const label = await tagsService.ensureLabel(task.project_id, String(cfg.tag));
      if (label) await tagsService.attach(task.id, label.id);
      return;
    }
    case "set_priority": {
      const p = PRIORITY_MAP[String(cfg.priority)];
      if (!p) return;
      await taskService.update(task.id, { priority: p } as any);
      return;
    }
    case "set_type": {
      if (!cfg.taskType) return;
      await taskService.update(task.id, { task_type: String(cfg.taskType) } as any);
      return;
    }
    case "send_notification": {
      const targets = await responsibleIds(task);
      await Promise.all(targets.map((uid) => notificationService.create({
        userId: uid, type: "task_assigned",
        content: `Automação "${auto.name}": ${task.title ?? "tarefa"}`, taskId: task.id,
      })));
      return;
    }
    case "create_subsequent": {
      if (!cfg.title) return;
      const first = [...ctx.columns].sort((x, y) => x.position - y.position)[0];
      if (!first) return;
      await taskService.create({ project_id: task.project_id, column_id: first.id, title: String(cfg.title), position: Date.now() % 100000 } as any);
      return;
    }
    case "send_email": {
      // Não há infraestrutura de e-mail no projeto — fallback: notifica no app e
      // avisa no console. (Quando houver um provider, trocar por envio real.)
      console.warn("[automationEngine] send_email sem infra de e-mail — enviando notificação como fallback");
      let targets: string[] = [];
      if (cfg.target === "Seguidores") {
        const { data } = await (sb as any).from("task_followers").select("user_id").eq("task_id", task.id);
        targets = (data ?? []).map((r: any) => r.user_id);
      } else {
        targets = await responsibleIds(task); // Responsável / Usuário específico → responsáveis
      }
      await Promise.all(targets.map((uid) => notificationService.create({
        userId: uid, type: "task_assigned",
        content: `[E-mail pendente] Automação "${auto.name}": ${task.title ?? "tarefa"}`, taskId: task.id,
      })));
      return;
    }
    case "send_slack": {
      // Alvos: Criador / Seguidores / Responsável (marcáveis). Resolve os user_ids
      // e a rota server manda DM no Slack de cada um (via e-mail → Slack).
      const targets: string[] = Array.isArray(cfg.targets)
        ? cfg.targets
        : cfg.target ? [String(cfg.target)] : [];
      if (!targets.length) return;
      const ids = new Set<string>();
      if (targets.includes("creator") && (task as any).created_by) ids.add((task as any).created_by as string);
      if (targets.includes("assignee")) (await responsibleIds(task)).forEach((id) => ids.add(id));
      if (targets.includes("followers")) {
        const { data } = await (sb as any).from("task_followers").select("user_id").eq("task_id", task.id);
        (data ?? []).forEach((r: any) => { if (r.user_id) ids.add(r.user_id); });
      }
      if (!ids.size) { engineToast("⚠️ Slack: nenhum destinatário (a task tem criador/seguidores?)"); return; }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const link = appUrl ? `\n${appUrl}/tasks/${task.id}` : "";
      const custom = cfg.message ? String(cfg.message).replace(/\{tarefa\}/g, task.title ?? "tarefa") : null;
      const text = `${custom ?? `🔔 *${auto.name}* — Tarefa: *${task.title ?? "tarefa"}*`}${link}`;
      try {
        const res = await fetch("/api/slack/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [...ids], text }),
        });
        const json: any = await res.json().catch(() => null);
        if (!json?.ok) {
          engineToast(json?.error === "not_configured" ? "⚠️ Slack não configurado (SLACK_BOT_TOKEN na Vercel)" : `⚠️ Slack falhou: ${json?.error ?? res.status}`);
        } else if ((json.sent ?? 0) === 0) {
          engineToast("⚠️ Slack: ninguém encontrado (e-mail do MedwayRun ≠ Slack?)");
        }
      } catch (e) {
        console.error("[automationEngine] send_slack", e);
        engineToast("⚠️ Falha ao notificar no Slack");
      }
      return;
    }
    default:
      console.warn("[automationEngine] ação desconhecida:", a.type);
  }
}

// ── Entrada principal ─────────────────────────────────────────────────────────
export async function runAutomations(ev: EngineEvent, taskId: string): Promise<void> {
  try {
    const sb = createRawClient();
    const { data: task } = await (sb as any)
      .from("tasks")
      .select("id, project_id, column_id, title, assignee_id, due_date, created_by")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return;

    const autos = await activeAutomations(task.project_id);
    if (!autos.length) return;

    const cols = await boardColumns(task.project_id);
    let approvalsCache: any[] | undefined;
    const ctx: Ctx = {
      columns: cols,
      currentStageName: cols.find((c) => c.id === task.column_id)?.name ?? "",
      getApprovals: async () => (approvalsCache ??= await approvalService.getForTask(task.id)),
    };
    const evDomain = EVENT_DOMAIN[ev.type];

    for (const auto of autos) {
      const triggers = auto.trigger_config?.triggers ?? [];
      if (!triggers.length) continue;
      // Só avalia se o evento atual é relevante a algum gatilho desta regra.
      if (!triggers.some((t) => TRIGGER_DOMAIN[t.event] === evDomain)) continue;

      const logic = auto.trigger_config?.logic === "AND" ? "AND" : "OR";
      const sat = await Promise.all(triggers.map((t) => triggerSatisfied(t, ev, ctx)));
      const fire = logic === "AND" ? sat.every(Boolean) : sat.some(Boolean);
      if (!fire) continue;

      // Dedup: evita re-executar a MESMA regra p/ a MESMA tarefa no mesmo evento
      // em rajada (duplo-clique, re-drag), que duplicaria notificação/subtarefa.
      if (firedRecently(`${auto.id}:${task.id}:${ev.type}`)) continue;

      for (const action of (auto.action_config?.actions ?? [])) {
        try { await runAction(action, auto, task as EngineTask, ctx); }
        catch (e) { console.error("[automationEngine] ação", action.type, e); }
      }
      await bumpCount(auto);
    }
  } catch (e) {
    console.error("[automationEngine] runAutomations", e);
  }
}

/**
 * Varredura best-effort do gatilho "Prazo próximo" (baseado em tempo). Chamada ao
 * abrir o quadro; deduplica por sessão para não repetir na mesma navegação.
 * Cobertura robusta (mesmo com ninguém no app) exigiria pg_cron/Edge Function.
 */
const dueDateFired = new Set<string>();
export async function sweepDueDates(boardId: string): Promise<void> {
  try {
    const autos = (await activeAutomations(boardId)).filter((a) =>
      (a.trigger_config?.triggers ?? []).some((t) => t.event === "due_date_near"));
    if (!autos.length) return;
    const sb = createRawClient();
    const { data: tasks } = await (sb as any)
      .from("tasks").select("id, due_date, status").eq("project_id", boardId).not("due_date", "is", null).is("deleted_at", null);
    const now = Date.now();
    for (const auto of autos) {
      const trg = (auto.trigger_config?.triggers ?? []).find((t) => t.event === "due_date_near");
      const days = Number((trg?.config as any)?.days ?? 1);
      for (const t of (tasks ?? [])) {
        if (t.status === "delivered") continue;
        const due = new Date(t.due_date + "T23:59:59").getTime();
        const withinWindow = due >= now && due <= now + days * 86400000;
        const key = `${auto.id}:${t.id}`;
        if (withinWindow && !dueDateFired.has(key)) {
          dueDateFired.add(key);
          await runAutomations({ type: "due_date_near", days }, t.id);
        }
      }
    }
  } catch (e) {
    console.error("[automationEngine] sweepDueDates", e);
  }
}
