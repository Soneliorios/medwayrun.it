"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye, EyeOff, Plus, Trash2, Pencil, Check, X, Loader2, GripVertical, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUILTIN_TASK_FIELDS,
  CUSTOM_FIELD_TYPES,
  customFieldHasOptions,
  customFieldTypeLabel,
  type CustomFieldType,
} from "@/lib/boardFields";
import {
  boardFieldService,
  type BoardCustomField,
} from "@/features/board/services/boardFieldService";

/**
 * Editor do "Layout da task" de um quadro (Fase 1):
 *  • liga/desliga campos nativos e marca quais são obrigatórios na criação;
 *  • cria/edita/remove campos customizados (com tipo e opções).
 * A aplicação no detalhe da task (Fase 2) e na criação (Fase 3) leem esse config.
 */
export default function TaskLayoutTab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [required, setRequired] = useState<Set<string>>(new Set());
  const [savingBuiltin, setSavingBuiltin] = useState(false);
  const [customs, setCustoms] = useState<BoardCustomField[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [layout, fields] = await Promise.all([
        boardFieldService.getBuiltinLayout(projectId),
        boardFieldService.listCustom(projectId),
      ]);
      if (!alive) return;
      setHidden(new Set(layout.hidden));
      setRequired(new Set(layout.required));
      setCustoms(fields);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId]);

  async function persistBuiltin(nextHidden: Set<string>, nextRequired: Set<string>) {
    setSavingBuiltin(true);
    const ok = await boardFieldService.setBuiltinLayout(projectId, {
      hidden: [...nextHidden],
      required: [...nextRequired],
    });
    setSavingBuiltin(false);
    return ok;
  }

  async function toggleVisible(key: string) {
    const prevHidden = hidden;
    const prevRequired = required;
    const nextHidden = new Set(prevHidden);
    const nextRequired = new Set(prevRequired);
    if (nextHidden.has(key)) {
      nextHidden.delete(key); // volta a aparecer
    } else {
      nextHidden.add(key); // esconde → não pode ser obrigatório
      nextRequired.delete(key);
    }
    setHidden(nextHidden);
    setRequired(nextRequired);
    const ok = await persistBuiltin(nextHidden, nextRequired);
    if (!ok) { setHidden(prevHidden); setRequired(prevRequired); alert("Não foi possível salvar a alteração. Tente novamente."); }
  }

  async function toggleRequired(key: string) {
    if (hidden.has(key)) return; // campo escondido não pode ser obrigatório
    const prevRequired = required;
    const nextRequired = new Set(prevRequired);
    if (nextRequired.has(key)) nextRequired.delete(key);
    else nextRequired.add(key);
    setRequired(nextRequired);
    const ok = await persistBuiltin(hidden, nextRequired);
    if (!ok) { setRequired(prevRequired); alert("Não foi possível salvar a alteração. Tente novamente."); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-brand-navy">Layout da task</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Escolha os campos que aparecem nas tarefas deste quadro e quais são obrigatórios
          ao criar. Título, quadro e etapa aparecem sempre.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-6">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* ── Campos padrão ──────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700">Campos padrão</h3>
              {savingBuiltin && (
                <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                  <Loader2 size={11} className="animate-spin" /> salvando
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {BUILTIN_TASK_FIELDS.map((f) => {
                const isHidden = hidden.has(f.key);
                const isRequired = required.has(f.key);
                return (
                  <div
                    key={f.key}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border shadow-sm transition-colors",
                      isHidden ? "border-neutral-100 bg-neutral-50" : "border-neutral-100 bg-white"
                    )}
                  >
                    <button
                      onClick={() => toggleVisible(f.key)}
                      title={isHidden ? "Mostrar campo" : "Esconder campo"}
                      className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0",
                        isHidden
                          ? "text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100"
                          : "text-brand-teal hover:bg-brand-teal/10"
                      )}
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <span className={cn("text-sm flex-1", isHidden ? "text-neutral-400" : "text-neutral-700")}>
                      {f.label}
                    </span>
                    {f.requirable ? (
                      <button
                        onClick={() => toggleRequired(f.key)}
                        disabled={isHidden}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors disabled:opacity-30",
                          isRequired
                            ? "bg-brand-navy text-white"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                        )}
                      >
                        {isRequired && <Check size={11} />}
                        Obrigatório
                      </button>
                    ) : (
                      <span className="text-[11px] text-neutral-300 px-2.5">opcional</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Campos personalizados ──────────────────────────────────────── */}
          <CustomFieldsSection
            projectId={projectId}
            customs={customs}
            setCustoms={setCustoms}
          />
        </>
      )}
    </div>
  );
}

// ── Seção de campos customizados ──────────────────────────────────────────────
function CustomFieldsSection({
  projectId,
  customs,
  setCustoms,
}: {
  projectId: string;
  customs: BoardCustomField[];
  setCustoms: React.Dispatch<React.SetStateAction<BoardCustomField[]>>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleCreate(input: DraftField) {
    const created = await boardFieldService.createCustom(projectId, {
      label: input.label.trim(),
      type: input.type,
      options: input.options,
      required: input.required,
      position: customs.length,
    });
    if (created) {
      setCustoms((prev) => [...prev, created]);
      setAdding(false);
    }
  }

  async function handleUpdate(id: string, input: DraftField) {
    const ok = await boardFieldService.updateCustom(id, {
      label: input.label.trim(),
      type: input.type,
      options: input.options,
      required: input.required,
    });
    if (ok) {
      setCustoms((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, label: input.label.trim(), type: input.type, options: input.options, required: input.required } : c
        )
      );
      setEditId(null);
    }
  }

  async function handleRemove(id: string, label: string) {
    if (!confirm(`Remover o campo "${label}"? Os valores já preenchidos nas tarefas serão perdidos.`)) return;
    const prev = customs;
    setCustoms((p) => p.filter((c) => c.id !== id)); // otimista
    const ok = await boardFieldService.removeCustom(id);
    if (!ok) setCustoms(prev); // restaura em caso de erro
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700">Campos personalizados</h3>
        <p className="text-[12px] text-neutral-400">
          Campos exclusivos deste quadro. Aparecem em todas as tarefas dele.
        </p>
      </div>

      <div className="space-y-1.5">
        {customs.length === 0 && !adding && (
          <p className="text-sm text-neutral-400 py-2">Nenhum campo personalizado ainda.</p>
        )}

        {customs.map((c) =>
          editId === c.id ? (
            <FieldEditor
              key={c.id}
              initial={{ label: c.label, type: c.type, options: c.options, required: c.required }}
              onCancel={() => setEditId(null)}
              onSave={(input) => handleUpdate(c.id, input)}
            />
          ) : (
            <div key={c.id} className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-neutral-100 shadow-sm">
              <GripVertical size={13} className="text-neutral-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-neutral-700 font-medium truncate">{c.label}</span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                    {customFieldTypeLabel(c.type)}
                  </span>
                  {c.required && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-navy text-white">obrigatório</span>
                  )}
                </div>
                {customFieldHasOptions(c.type) && c.options.length > 0 && (
                  <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{c.options.join(" · ")}</p>
                )}
              </div>
              <button
                onClick={() => { setAdding(false); setEditId(c.id); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-300 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => handleRemove(c.id, c.label)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        )}

        {adding ? (
          <FieldEditor
            initial={{ label: "", type: "text", options: [], required: false }}
            onCancel={() => setAdding(false)}
            onSave={handleCreate}
          />
        ) : (
          <button
            onClick={() => { setEditId(null); setAdding(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
          >
            <Plus size={13} /> Novo campo
          </button>
        )}
      </div>
    </section>
  );
}

// ── Formulário de criar/editar um campo customizado ──────────────────────────
interface DraftField {
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}

function FieldEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: DraftField;
  onSave: (input: DraftField) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [type, setType] = useState<CustomFieldType>(initial.type);
  const [optionsText, setOptionsText] = useState(initial.options.join("\n"));
  const [required, setRequired] = useState(initial.required);
  const [saving, setSaving] = useState(false);

  const showOptions = customFieldHasOptions(type);
  const options = useMemo(
    () => optionsText.split("\n").map((o) => o.trim()).filter(Boolean),
    [optionsText]
  );
  const invalid = !label.trim() || (showOptions && options.length === 0);

  async function submit() {
    if (invalid || saving) return;
    setSaving(true);
    await onSave({ label: label.trim(), type, options: showOptions ? options : [], required });
    setSaving(false);
  }

  return (
    <div className="p-3 bg-neutral-50 rounded-xl border border-brand-teal/30 space-y-2.5">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nome do campo (ex.: Canal, Orçamento, Link do briefing)"
        className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
      />
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldType)}
          className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
        >
          {CUSTOM_FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRequired((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0",
            required ? "bg-brand-navy text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
          )}
        >
          {required && <Check size={12} />} Obrigatório
        </button>
      </div>

      {showOptions && (
        <div className="space-y-1">
          <label className="text-[11px] text-neutral-500 flex items-center gap-1">
            <AlertCircle size={11} /> Uma opção por linha
          </label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Opção 1\nOpção 2\nOpção 3"}
            rows={3}
            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white resize-y"
          />
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:bg-neutral-100 transition-colors"
        >
          <X size={12} /> Cancelar
        </button>
        <button
          disabled={invalid || saving}
          onClick={submit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
        </button>
      </div>
    </div>
  );
}
