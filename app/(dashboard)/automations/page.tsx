"use client";

import { useEffect, useState } from "react";
import {
  Zap, Plus, ArrowRight, Clock, UserCheck, MoveRight, Bell, Tag, Trash2,
  ChevronDown, ChevronRight, X, Mail, Flag, UserMinus, GitBranch, ClipboardCheck,
  MessageSquare, Paperclip, CheckCircle2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/features/projects/store/projectStore";
interface MockAutomationAction { type: string; config: Record<string, unknown>; }
interface MockAutomation {
  id: string; name: string; board: string; trigger: string;
  trigger_config: Record<string, unknown>; actions: MockAutomationAction[];
  is_active: boolean; executions: number;
  logs: Array<{ at: string; task: string; status: "success" | "error"; message: string }>;
}

// ── Trigger & action catalogs ───────────────────────────────────────────────────

const TRIGGERS: Record<string, { label: string; icon: React.ElementType; extra?: "stage" | "approver" | "days" }> = {
  task_created: { label: "Tarefa criada", icon: Plus },
  stage_entered: { label: "Tarefa entrar na etapa", icon: MoveRight, extra: "stage" },
  task_approved: { label: "Tarefa aprovada", icon: CheckCircle2, extra: "approver" },
  task_rejected: { label: "Tarefa rejeitada", icon: XCircle },
  due_date_near: { label: "Prazo próximo", icon: Clock, extra: "days" },
  task_delivered: { label: "Tarefa entregue", icon: UserCheck },
  comment_added: { label: "Comentário adicionado", icon: MessageSquare },
  attachment_added: { label: "Anexo adicionado", icon: Paperclip },
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
const DEMO_USERS = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Reis"];

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function AutomationsPage() {
  const projects = useProjectStore((s) => s.projects);
  const [automations] = useState<MockAutomation[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<string>("");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function toggle(_id: string, _is_active: boolean) { /* Supabase: not yet implemented */ }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function remove(_id: string) { /* Supabase: not yet implemented */ }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function rename(_id: string, _name: string) { /* Supabase: not yet implemented */ }

  const filtered = selectedBoard ? automations.filter((a) => a.board === selectedBoard) : automations;

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
          {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
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

          {filtered.map((auto) => {
            const TriggerIcon = TRIGGERS[auto.trigger]?.icon ?? Zap;
            return (
              <div key={auto.id} className={cn("bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden transition-all", !auto.is_active && "opacity-60")}>
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Editable name */}
                    <input
                      defaultValue={auto.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== auto.name) rename(auto.id, e.target.value.trim()); }}
                      className="text-sm font-semibold text-brand-navy bg-transparent outline-none focus:bg-neutral-50 rounded px-1 -ml-1 w-full mb-2"
                    />
                    {/* Trigger → actions flow */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="flex items-center gap-1.5 bg-neutral-50 rounded-lg px-2 py-1">
                        <TriggerIcon size={12} className="text-neutral-500" />
                        <span className="text-[11px] text-neutral-600">{TRIGGERS[auto.trigger]?.label ?? auto.trigger}</span>
                        {(auto.trigger_config as any)?.stage && <span className="text-[10px] text-brand-navy font-medium">· {(auto.trigger_config as any).stage}</span>}
                        {(auto.trigger_config as any)?.days != null && <span className="text-[10px] text-brand-navy font-medium">· {(auto.trigger_config as any).days}d antes</span>}
                      </span>
                      {auto.actions.map((act, i) => {
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
                    <span className="text-[10px] text-neutral-400" title="Execuções">{auto.executions}x</span>
                    <button onClick={() => toggle(auto.id, auto.is_active)} className={cn("w-8 h-4 rounded-full relative transition-all", auto.is_active ? "bg-brand-teal" : "bg-neutral-200")}>
                      <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all", auto.is_active ? "left-[18px]" : "left-0.5")} />
                    </button>
                    <button onClick={() => remove(auto.id)} className="text-neutral-300 hover:text-destructive"><Trash2 size={13} /></button>
                  </div>
                </div>

                {/* Execution log */}
                <button
                  onClick={() => setExpandedLog((e) => (e === auto.id ? null : auto.id))}
                  className="w-full flex items-center gap-1.5 px-4 py-1.5 border-t border-neutral-50 text-[11px] text-neutral-400 hover:bg-neutral-50/60"
                >
                  {expandedLog === auto.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  Log de execuções ({auto.logs.length})
                </button>
                {expandedLog === auto.id && (
                  <div className="px-4 pb-3 space-y-1">
                    {auto.logs.length === 0 ? (
                      <p className="text-[11px] text-neutral-300 py-1">Nenhuma execução registrada ainda.</p>
                    ) : auto.logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        {log.status === "success" ? <CheckCircle2 size={11} className="text-green-500" /> : <XCircle size={11} className="text-destructive" />}
                        <span className="text-neutral-400">{fmtDate(log.at)}</span>
                        <span className="text-neutral-600 truncate flex-1">{log.task} — {log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-neutral-400">
              <Zap size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma automação configurada.</p>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <AutomationBuilder
          boards={projects.map((p) => p.name)}
          defaultBoard={selectedBoard || projects[0]?.name || "Geral"}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); }}
        />
      )}
    </div>
  );
}

// ── Builder modal ────────────────────────────────────────────────────────────────

function AutomationBuilder({
  boards, defaultBoard, onClose, onSave,
}: {
  boards: string[];
  defaultBoard: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [board, setBoard] = useState(defaultBoard);
  const [trigger, setTrigger] = useState("task_created");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [actions, setActions] = useState<MockAutomationAction[]>([{ type: "send_notification", config: {} }]);

  const triggerExtra = TRIGGERS[trigger]?.extra;

  function setActionType(i: number, type: string) {
    setActions((arr) => arr.map((a, j) => (j === i ? { type, config: {} } : a)));
  }
  function setActionConfig(i: number, config: Record<string, unknown>) {
    setActions((arr) => arr.map((a, j) => (j === i ? { ...a, config } : a)));
  }
  function addAction() { setActions((arr) => [...arr, { type: "add_tag", config: {} }]); }
  function removeAction(i: number) { setActions((arr) => arr.filter((_, j) => j !== i)); }

  function save() {
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 sticky top-0 bg-white">
          <h3 className="text-sm font-semibold text-brand-navy">Nova automação</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <Field label="Nome da automação">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Notificar ao entregar"
              className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 outline-none focus:border-brand-teal" />
          </Field>

          {/* Board */}
          <Field label="Quadro">
            <select value={board} onChange={(e) => setBoard(e.target.value)} className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-brand-teal">
              {boards.length === 0 && <option>Geral</option>}
              {boards.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>

          {/* Trigger */}
          <Field label="Quando... (gatilho)">
            <select value={trigger} onChange={(e) => { setTrigger(e.target.value); setTriggerConfig({}); }} className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-brand-teal">
              {Object.entries(TRIGGERS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
            </select>
            {triggerExtra === "stage" && (
              <input placeholder="Nome da etapa..." onChange={(e) => setTriggerConfig({ stage: e.target.value })}
                className="mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 outline-none focus:border-brand-teal" />
            )}
            {triggerExtra === "approver" && (
              <select onChange={(e) => setTriggerConfig({ approver: e.target.value })} className="mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-brand-teal">
                <option value="">Aprovador...</option>
                {DEMO_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            {triggerExtra === "days" && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} defaultValue={1} onChange={(e) => setTriggerConfig({ days: parseInt(e.target.value) || 1 })}
                  className="w-20 text-xs border border-neutral-200 rounded-lg px-2.5 py-2 outline-none focus:border-brand-teal" />
                <span className="text-xs text-neutral-400">dias antes do prazo</span>
              </div>
            )}
          </Field>

          {/* Actions */}
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
                  <ActionConfig action={act} onChange={(cfg) => setActionConfig(i, cfg)} />
                </div>
              ))}
            </div>
            <button onClick={addAction} className="mt-2 flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark">
              <Plus size={12} /> Adicionar ação
            </button>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-neutral-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="flex-1 bg-brand-teal hover:opacity-90 text-white" onClick={save}>Criar automação</Button>
        </div>
      </div>
    </div>
  );
}

function ActionConfig({ action, onChange }: { action: MockAutomationAction; onChange: (cfg: Record<string, unknown>) => void }) {
  const extra = ACTIONS[action.type]?.extra;
  if (!extra) return null;
  const base = "mt-2 w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-brand-teal";
  switch (extra) {
    case "users":
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_USERS.map((u) => {
            const sel = ((action.config.users as string[]) ?? []).includes(u);
            return (
              <button key={u} onClick={() => {
                const cur = (action.config.users as string[]) ?? [];
                onChange({ users: sel ? cur.filter((x) => x !== u) : [...cur, u] });
              }} className={cn("text-[11px] px-2 py-0.5 rounded-full border", sel ? "bg-brand-teal/10 border-brand-teal/40 text-brand-teal" : "border-neutral-200 text-neutral-500")}>
                {u}
              </button>
            );
          })}
        </div>
      );
    case "tag":
      return <input placeholder="Nome da tag..." className={base} onChange={(e) => onChange({ tag: e.target.value })} />;
    case "stage":
      return <input placeholder="Nome da etapa de destino..." className={base} onChange={(e) => onChange({ stage: e.target.value })} />;
    case "template":
      return <input placeholder="Título da tarefa subsequente..." className={base} onChange={(e) => onChange({ title: e.target.value })} />;
    case "email":
      return (
        <select className={base} onChange={(e) => onChange({ target: e.target.value })}>
          <option value="">Enviar email para...</option>
          {EMAIL_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    case "priority":
      return (
        <select className={base} onChange={(e) => onChange({ priority: e.target.value })}>
          <option value="">Prioridade...</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      );
    case "type":
      return (
        <select className={base} onChange={(e) => onChange({ taskType: e.target.value })}>
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
