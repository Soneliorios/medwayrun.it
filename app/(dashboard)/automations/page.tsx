"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Zap, Plus, ArrowRight, Clock, UserCheck, MoveRight, Bell, Tag, Trash2,
  X, Mail, Flag, UserMinus, GitBranch, ClipboardCheck,
  MessageSquare, Paperclip, CheckCircle2, XCircle, MapPin, Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { createRawClient } from "@/lib/supabase/client";
import {
  automationService,
  type AutomationRow,
  type AutomationTrigger,
  type AutomationAction,
} from "@/lib/automationService";
import { invalidateAutomationCache } from "@/lib/automationEngine";

// ── Trigger & action catalogs ───────────────────────────────────────────────────

// kind: "event" dispara no momento em que acontece; "condition" é um estado que
// precisa ser verdadeiro (combinável via E/OU com os demais).
// extra: "stage" → dropdown das etapas do quadro; "approver" → qualquer/usuário X;
// "days" → dias antes do prazo.
const TRIGGERS: Record<string, { label: string; icon: React.ElementType; kind: "event" | "condition"; extra?: "stage" | "approver" | "days" }> = {
  // Eventos (disparam no momento em que ocorrem)
  task_created: { label: "Tarefa criada", icon: Plus, kind: "event" },
  stage_entered: { label: "Entrou na etapa (ao mover)", icon: MoveRight, kind: "event", extra: "stage" },
  task_approved: { label: "Tarefa aprovada", icon: CheckCircle2, kind: "event", extra: "approver" },
  task_adjustment: { label: "Aprovação pediu ajuste", icon: ClipboardCheck, kind: "event", extra: "approver" },
  task_rejected: { label: "Tarefa rejeitada", icon: XCircle, kind: "event", extra: "approver" },
  task_delivered: { label: "Tarefa entregue", icon: UserCheck, kind: "event" },
  comment_added: { label: "Comentário adicionado", icon: MessageSquare, kind: "event" },
  attachment_added: { label: "Anexo adicionado", icon: Paperclip, kind: "event" },
  due_date_near: { label: "Prazo próximo", icon: Clock, kind: "event", extra: "days" },
  // Condições (estado atual — não precisa ter mudado agora)
  in_stage: { label: "Está na etapa", icon: MapPin, kind: "condition", extra: "stage" },
  approval_pending: { label: "Tem aprovação pendente", icon: Hourglass, kind: "condition", extra: "approver" },
};

const ACTIONS: Record<string, { label: string; icon: React.ElementType; extra?: "users" | "tag" | "stage" | "email" | "priority" | "type" | "template" }> = {
  assign_user: { label: "Alocar usuários", icon: UserCheck, extra: "users" },
  remove_assignee: { label: "Remover responsável", icon: UserMinus },
  add_tag: { label: "Adicionar tag", icon: Tag, extra: "tag" },
  create_subsequent: { label: "Criar tarefa subsequente", icon: GitBranch, extra: "template" },
  send_email: { label: "Enviar email para", icon: Mail, extra: "email" },
  set_priority: { label: "Alterar prioridade", icon: Flag, extra: "priority" },
  set_type: { label: "Alterar tipo", icon: ClipboardCheck, extra: "type" },
  move_to_stage: { label: "Mover para etapa", icon: MoveRight, extra: "stage" },
  send_notification: { label: "Enviar notificação", icon: Bell },
};

const EMAIL_TARGETS = ["Responsável", "Seguidores", "Usuário específico"];
const PRIORITIES = ["Baixa", "Média", "Alta", "Urgente"];
const TASK_TYPES = ["Padrão", "Bug", "Feature", "Melhoria", "Análise"];

interface BoardStage { id: string; name: string }

/** Normalizes stored triggers (new jsonb array, or legacy single-column shape). */
function readTriggers(a: AutomationRow): AutomationTrigger[] {
  if (Array.isArray(a.trigger_config?.triggers) && a.trigger_config.triggers.length) {
    return a.trigger_config.triggers;
  }
  return [{ event: a.trigger_event, config: (a.trigger_config as Record<string, unknown>) ?? {} }];
}
function readActions(a: AutomationRow): AutomationAction[] {
  if (Array.isArray(a.action_config?.actions) && a.action_config.actions.length) {
    return a.action_config.actions;
  }
  return a.action_type ? [{ type: a.action_type, config: (a.action_config as Record<string, unknown>) ?? {} }] : [];
}

function triggerExtraLabel(t: AutomationTrigger): string | null {
  const c = t.config ?? {};
  if (c.stage) return String(c.stage);
  if (c.approverName) return String(c.approverName);
  if (TRIGGERS[t.event]?.extra === "approver") return "qualquer usuário";
  if (c.days != null) return `${c.days}d antes`;
  return null;
}

export default function AutomationsPage() {
  const projects = useProjectStore((s) => s.projects);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<string>(""); // board_id

  const boardName = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  async function reload() {
    setLoading(true);
    setAutomations(await automationService.list());
    setLoading(false);
    invalidateAutomationCache();
  }
  useEffect(() => { reload(); }, []);

  async function toggle(id: string, is_active: boolean) {
    setAutomations((arr) => arr.map((a) => (a.id === id ? { ...a, is_active: !is_active } : a)));
    await automationService.setActive(id, !is_active);
    invalidateAutomationCache();
  }
  async function remove(id: string) {
    if (!confirm("Excluir esta automação?")) return;
    setAutomations((arr) => arr.filter((a) => a.id !== id));
    await automationService.remove(id);
    invalidateAutomationCache();
  }
  async function rename(id: string, name: string) {
    setAutomations((arr) => arr.map((a) => (a.id === id ? { ...a, name } : a)));
    await automationService.rename(id, name);
    invalidateAutomationCache();
  }

  const filtered = selectedBoard ? automations.filter((a) => a.board_id === selectedBoard) : automations;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100 bg-white shrink-0">
        <Zap size={18} className="text-brand-navy" />
        <h1 className="text-base font-semibold text-brand-navy">Automações</h1>
        <select
          value={selectedBoard}
          onChange={(e) => setSelectedBoard(e.target.value)}
          className="ml-4 text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-brand-teal text-neutral-600"
        >
          <option value="">Todos os quadros</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto bg-brand-navy hover:bg-brand-navy-light h-8 gap-1.5">
          <Plus size={14} /> Nova automação
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs text-neutral-400 mb-3">
            {filtered.length} {filtered.length !== 1 ? "automações" : "automação"} · {filtered.filter((a) => a.is_active).length} ativa{filtered.filter((a) => a.is_active).length !== 1 ? "s" : ""}
          </p>

          {loading && <p className="text-sm text-neutral-400 py-8 text-center">Carregando...</p>}

          {!loading && filtered.map((auto) => {
            const triggers = readTriggers(auto);
            const actions = readActions(auto);
            const logic = auto.trigger_config?.logic === "AND" ? "E" : "OU";
            return (
              <div key={auto.id} className={cn("bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden transition-all", !auto.is_active && "opacity-60")}>
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <input
                      defaultValue={auto.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== auto.name) rename(auto.id, e.target.value.trim()); }}
                      className="text-sm font-semibold text-brand-navy bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 w-full mb-1"
                    />
                    <p className="text-[10px] text-neutral-400 mb-2">{boardName[auto.board_id] ?? "Quadro"}</p>
                    {/* Triggers (E/OU) → actions flow */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {triggers.map((t, i) => {
                        const TriggerIcon = TRIGGERS[t.event]?.icon ?? Zap;
                        const extra = triggerExtraLabel(t);
                        return (
                          <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-[9px] font-bold text-neutral-400 uppercase">{logic}</span>}
                            <span className="flex items-center gap-1.5 bg-neutral-50 rounded-lg px-2 py-1">
                              <TriggerIcon size={12} className="text-neutral-500" />
                              <span className="text-[11px] text-neutral-600">{TRIGGERS[t.event]?.label ?? t.event}</span>
                              {extra && <span className="text-[10px] text-brand-navy font-medium">· {extra}</span>}
                            </span>
                          </span>
                        );
                      })}
                      {actions.map((act, i) => {
                        const ActionIcon = ACTIONS[act.type]?.icon ?? Zap;
                        return (
                          <span key={i} className="flex items-center gap-1.5">
                            <ArrowRight size={12} className="text-neutral-300" />
                            <span className="flex items-center gap-1.5 bg-brand-teal/5 rounded-lg px-2 py-1">
                              <span className="text-[9px] font-bold text-brand-teal">#{i + 1}</span>
                              <ActionIcon size={12} className="text-brand-teal" />
                              <span className="text-[11px] text-brand-teal font-medium">{ACTIONS[act.type]?.label ?? act.type}</span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-neutral-400" title="Execuções">{auto.execution_count}x</span>
                    <button onClick={() => toggle(auto.id, auto.is_active)} className={cn("w-8 h-4 rounded-full relative transition-all", auto.is_active ? "bg-brand-teal" : "bg-neutral-200")}>
                      <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all", auto.is_active ? "left-[18px]" : "left-0.5")} />
                    </button>
                    <button onClick={() => remove(auto.id)} className="text-neutral-300 hover:text-destructive"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-neutral-400">
              <Zap size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma automação configurada.</p>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <AutomationBuilder
          projects={projects}
          defaultBoardId={selectedBoard || projects[0]?.id || ""}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); reload(); }}
        />
      )}
    </div>
  );
}

// ── Builder modal ────────────────────────────────────────────────────────────────

function AutomationBuilder({
  projects, defaultBoardId, onClose, onSaved,
}: {
  projects: { id: string; name: string }[];
  defaultBoardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const members = useOrgMembers();
  const [name, setName] = useState("");
  const [board, setBoard] = useState(defaultBoardId);
  const [logic, setLogic] = useState<"AND" | "OR">("OR");
  const [triggers, setTriggers] = useState<AutomationTrigger[]>([{ event: "task_created", config: {} }]);
  const [actions, setActions] = useState<AutomationAction[]>([{ type: "send_notification", config: {} }]);
  const [stages, setStages] = useState<BoardStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the selected board's real stages so every stage picker is a dropdown.
  useEffect(() => {
    if (!board) { setStages([]); return; }
    let cancelled = false;
    const sb = createRawClient();
    (sb as any).from("columns").select("id, name, position").eq("project_id", board).order("position")
      .then(({ data }: { data: BoardStage[] | null }) => {
        if (!cancelled) setStages((data ?? []).map((c) => ({ id: c.id, name: c.name })));
      });
    return () => { cancelled = true; };
  }, [board]);

  function setTriggerEvent(i: number, event: string) {
    setTriggers((arr) => arr.map((t, j) => (j === i ? { event, config: {} } : t)));
  }
  function setTriggerConfig(i: number, config: Record<string, unknown>) {
    setTriggers((arr) => arr.map((t, j) => (j === i ? { ...t, config } : t)));
  }
  function addTrigger() { setTriggers((arr) => [...arr, { event: "stage_entered", config: {} }]); }
  function removeTrigger(i: number) { setTriggers((arr) => arr.filter((_, j) => j !== i)); }

  function setActionType(i: number, type: string) {
    setActions((arr) => arr.map((a, j) => (j === i ? { type, config: {} } : a)));
  }
  function setActionConfig(i: number, config: Record<string, unknown>) {
    setActions((arr) => arr.map((a, j) => (j === i ? { ...a, config } : a)));
  }
  function addAction() { setActions((arr) => [...arr, { type: "add_tag", config: {} }]); }
  function removeAction(i: number) { setActions((arr) => arr.filter((_, j) => j !== i)); }

  async function save() {
    if (saving) return;
    if (!board) { setError("Selecione um quadro."); return; }
    if (triggers.length === 0) { setError("Adicione pelo menos um gatilho."); return; }
    if (actions.length === 0) { setError("Adicione pelo menos uma ação."); return; }
    // Every stage trigger needs a chosen stage.
    for (const t of triggers) {
      if (TRIGGERS[t.event]?.extra === "stage" && !t.config.stage) {
        setError(`Escolha a etapa do gatilho "${TRIGGERS[t.event].label}".`); return;
      }
    }
    // Every action whose config is required must be filled.
    const ACTION_FIELD: Record<string, string> = {
      tag: "tag", stage: "stage", template: "title", email: "target", priority: "priority", type: "taskType",
    };
    for (const a of actions) {
      const extra = ACTIONS[a.type]?.extra;
      if (extra === "users") {
        if (!((a.config.users as string[])?.length)) { setError(`Selecione os usuários da ação "${ACTIONS[a.type].label}".`); return; }
      } else if (extra && ACTION_FIELD[extra] && !a.config[ACTION_FIELD[extra]]) {
        setError(`Complete a configuração da ação "${ACTIONS[a.type].label}".`); return;
      }
    }
    setSaving(true);
    setError(null);
    const created = await automationService.create({
      board_id: board,
      name: name.trim() || "Nova automação",
      logic,
      triggers,
      actions,
    });
    setSaving(false);
    if (!created) { setError("Não foi possível salvar. Tente novamente."); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-semibold text-brand-navy">Nova automação</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Nome da automação">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Notificar ao entregar"
              className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 outline-none focus:border-brand-teal" />
          </Field>

          <Field label="Quadro">
            <select value={board} onChange={(e) => setBoard(e.target.value)} className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-brand-teal">
              {projects.length === 0 && <option value="">Nenhum quadro</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {/* Triggers with AND/OR */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Quando... (gatilhos)</p>
              {triggers.length > 1 && (
                <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
                  {(["OR", "AND"] as const).map((l) => (
                    <button key={l} onClick={() => setLogic(l)} className={cn("px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors", logic === l ? "bg-white text-brand-navy shadow-sm" : "text-neutral-500")}>
                      {l === "OR" ? "Qualquer (OU)" : "Todos (E)"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-neutral-400 mb-2 leading-snug">
              Combine <strong>eventos</strong> (disparam ao acontecer) e <strong>condições</strong> (estado atual, ex.: “está na etapa X”, “tem aprovação pendente”). Com <strong>Todos (E)</strong> a regra só roda quando tudo for verdadeiro.
            </p>
            <div className="space-y-2">
              {triggers.map((t, i) => (
                <div key={i} className="border border-neutral-100 rounded-lg p-2.5 bg-neutral-50/50">
                  <div className="flex items-center gap-2">
                    {i > 0 && <span className="text-[9px] font-bold text-neutral-400 uppercase w-7 shrink-0">{logic === "AND" ? "E" : "OU"}</span>}
                    <select value={t.event} onChange={(e) => setTriggerEvent(i, e.target.value)} className="flex-1 text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-teal">
                      <optgroup label="Eventos (disparam ao acontecer)">
                        {Object.entries(TRIGGERS).filter(([, tr]) => tr.kind === "event").map(([v, tr]) => <option key={v} value={v}>{tr.label}</option>)}
                      </optgroup>
                      <optgroup label="Condições (estado atual)">
                        {Object.entries(TRIGGERS).filter(([, tr]) => tr.kind === "condition").map(([v, tr]) => <option key={v} value={v}>{tr.label}</option>)}
                      </optgroup>
                    </select>
                    {triggers.length > 1 && (
                      <button onClick={() => removeTrigger(i)} className="text-neutral-300 hover:text-destructive shrink-0"><Trash2 size={12} /></button>
                    )}
                  </div>
                  <TriggerConfig trigger={t} stages={stages} members={members} onChange={(cfg) => setTriggerConfig(i, cfg)} />
                </div>
              ))}
            </div>
            <button onClick={addTrigger} className="mt-2 flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark">
              <Plus size={12} /> Adicionar gatilho
            </button>
          </div>

          {/* Actions in sequence */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Então... (ações em sequência)</p>
            <div className="space-y-2">
              {actions.map((act, i) => (
                <div key={i} className="border border-neutral-100 rounded-lg p-2.5 bg-neutral-50/50">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold flex items-center justify-center shrink-0">#{i + 1}</span>
                    <select value={act.type} onChange={(e) => setActionType(i, e.target.value)} className="flex-1 text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-teal">
                      {Object.entries(ACTIONS).map(([v, a]) => <option key={v} value={v}>{a.label}</option>)}
                    </select>
                    {actions.length > 1 && (
                      <button onClick={() => removeAction(i)} className="text-neutral-300 hover:text-destructive shrink-0"><Trash2 size={12} /></button>
                    )}
                  </div>
                  <ActionConfig action={act} members={members} stages={stages} onChange={(cfg) => setActionConfig(i, cfg)} />
                </div>
              ))}
            </div>
            <button onClick={addAction} className="mt-2 flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark">
              <Plus size={12} /> Adicionar ação
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-neutral-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="flex-1 bg-brand-teal hover:opacity-90 text-white" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Criar automação"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StageSelect({ value, stages, onChange }: { value: string; stages: BoardStage[]; onChange: (name: string) => void }) {
  const base = "mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-brand-teal";
  if (stages.length === 0) {
    return <p className="mt-2 text-[11px] text-neutral-400">Nenhuma etapa neste quadro (selecione um quadro com etapas).</p>;
  }
  return (
    <select value={value} className={base} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecionar etapa...</option>
      {stages.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
    </select>
  );
}

function TriggerConfig({ trigger, stages, members, onChange }: {
  trigger: AutomationTrigger; stages: BoardStage[]; members: { id: string; full_name: string }[];
  onChange: (cfg: Record<string, unknown>) => void;
}) {
  const extra = TRIGGERS[trigger.event]?.extra;
  const base = "mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-brand-teal";
  if (extra === "stage") {
    return <StageSelect value={String(trigger.config.stage ?? "")} stages={stages} onChange={(name) => onChange({ stage: name })} />;
  }
  if (extra === "approver") {
    return (
      <select
        className={base}
        value={String(trigger.config.approver ?? "")}
        onChange={(e) => {
          const id = e.target.value;
          const m = members.find((x) => x.id === id);
          onChange(id ? { approver: id, approverName: m?.full_name ?? id } : {});
        }}
      >
        <option value="">Qualquer usuário</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
    );
  }
  if (extra === "days") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <input type="number" min={1} value={Number(trigger.config.days ?? 1)} onChange={(e) => onChange({ days: parseInt(e.target.value) || 1 })}
          className="w-20 text-xs border border-neutral-200 rounded-lg px-2.5 py-2 outline-none focus:border-brand-teal" />
        <span className="text-xs text-neutral-400">dias antes do prazo</span>
      </div>
    );
  }
  return null;
}

function ActionConfig({ action, members, stages, onChange }: {
  action: AutomationAction; members: { id: string; full_name: string }[]; stages: BoardStage[];
  onChange: (cfg: Record<string, unknown>) => void;
}) {
  const extra = ACTIONS[action.type]?.extra;
  if (!extra) return null;
  const base = "mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-brand-teal";
  switch (extra) {
    case "users":
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.length === 0 && <span className="text-[11px] text-neutral-400">Carregando membros...</span>}
          {members.map((u) => {
            const sel = ((action.config.users as string[]) ?? []).includes(u.id);
            return (
              <button key={u.id} onClick={() => {
                const cur = (action.config.users as string[]) ?? [];
                onChange({ users: sel ? cur.filter((x) => x !== u.id) : [...cur, u.id] });
              }} className={cn("text-[11px] px-2 py-0.5 rounded-full border", sel ? "bg-brand-teal/10 border-brand-teal/40 text-brand-teal" : "border-neutral-200 text-neutral-500")}>
                {u.full_name}
              </button>
            );
          })}
        </div>
      );
    case "tag":
      return <input placeholder="Nome da tag..." value={String(action.config.tag ?? "")} className={base} onChange={(e) => onChange({ tag: e.target.value })} />;
    case "stage":
      return <StageSelect value={String(action.config.stage ?? "")} stages={stages} onChange={(name) => onChange({ stage: name })} />;
    case "template":
      return <input placeholder="Título da tarefa subsequente..." value={String(action.config.title ?? "")} className={base} onChange={(e) => onChange({ title: e.target.value })} />;
    case "email":
      return (
        <select className={base} value={String(action.config.target ?? "")} onChange={(e) => onChange({ target: e.target.value })}>
          <option value="">Enviar email para...</option>
          {EMAIL_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    case "priority":
      return (
        <select className={base} value={String(action.config.priority ?? "")} onChange={(e) => onChange({ priority: e.target.value })}>
          <option value="">Prioridade...</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      );
    case "type":
      return (
        <select className={base} value={String(action.config.taskType ?? "")} onChange={(e) => onChange({ taskType: e.target.value })}>
          <option value="">Tipo...</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
