"use client";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Copy, Eye, Star, Lock, MessageSquare, ChevronDown, Check, X, Calendar, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

interface FormItem {
  id: string; name: string; description: string;
  type: "internal" | "external"; responses: number; project: string;
  is_active: boolean; is_favorite: boolean; internal_access: boolean;
  external_access: boolean; portals: number; target_stage: string; created_at: string;
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResponsesModal, setShowResponsesModal] = useState<FormItem | null>(null);
  const [newForm, setNewForm] = useState({ name: "", description: "", target_stage: "A fazer", project: "" });
  const [creating, setCreating] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  function startRename(id: string, current: string) {
    setEditingNameId(id);
    setEditNameValue(current);
  }
  function saveName(id: string) {
    const trimmed = editNameValue.trim();
    if (trimmed) patch(id, { name: trimmed });
    setEditingNameId(null);
    setEditNameValue("");
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createRawClient();

      async function fetchRows(): Promise<any[]> {
        const { data } = await (supabase as any)
          .from("forms")
          .select("id, name, description, is_active, internal_access, external_access, portals, responses, target_stage, created_at, board_id")
          .eq("org_id", ORG_ID)
          .order("created_at", { ascending: false });
        return (data as any[]) ?? [];
      }

      const rows = await fetchRows();

      setForms(
        rows.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description ?? "",
          type: f.external_access ? "external" : "internal",
          responses: f.responses ?? 0,
          project: f.board_id ?? "",
          is_active: f.is_active,
          is_favorite: false,
          internal_access: f.internal_access,
          external_access: f.external_access,
          portals: f.portals ?? 0,
          target_stage: f.target_stage ?? "A fazer",
          created_at: f.created_at?.slice(0, 10) ?? "",
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  async function patch(id: string, updates: Partial<FormItem>) {
    const supabase = createRawClient();
    const dbUpdates: Record<string, unknown> = {};
    if ("name" in updates) dbUpdates.name = updates.name;
    if ("is_active" in updates) dbUpdates.is_active = updates.is_active;
    if ("internal_access" in updates) dbUpdates.internal_access = updates.internal_access;
    if ("external_access" in updates) dbUpdates.external_access = updates.external_access;
    if ("portals" in updates) dbUpdates.portals = updates.portals;
    if ("target_stage" in updates) dbUpdates.target_stage = updates.target_stage;
    if ("is_favorite" in updates) {} // not a DB column — local only
    await (supabase as any).from("forms").update(dbUpdates).eq("id", id);
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function copyLink(id: string) { navigator.clipboard?.writeText(window.location.origin + "/forms/" + id); setCopied(id); setTimeout(() => setCopied(null), 2000); }

  async function deleteForm(id: string, name: string) {
    if (!confirm(`Excluir o formulário "${name}"? Esta ação não pode ser desfeita.`)) return;
    const supabase = createRawClient();
    const { error } = await (supabase as any).from("forms").delete().eq("id", id);
    if (error) { console.error("[forms] delete error:", error); return; }
    setForms((prev) => prev.filter((f) => f.id !== id));
  }

  async function createForm() {
    if (!newForm.name.trim() || creating) return;
    setCreating(true);
    const supabase = createRawClient();
    const id = "form-" + Date.now();
    const { data, error } = await (supabase as any)
      .from("forms")
      .insert({
        id,
        org_id: ORG_ID,
        name: newForm.name.trim(),
        description: newForm.description.trim() || null,
        is_active: true,
        internal_access: true,
        external_access: false,
        target_stage: newForm.target_stage,
        fields: [],
        responses: 0,
        portals: 0,
      })
      .select()
      .single();
    setCreating(false);
    if (error) { console.error("[forms] create error:", error); return; }
    const form: FormItem = {
      id: data.id,
      name: data.name,
      description: data.description ?? "",
      type: data.external_access ? "external" : "internal",
      responses: 0,
      project: "",
      is_active: true,
      is_favorite: false,
      internal_access: data.internal_access,
      external_access: data.external_access,
      portals: 0,
      target_stage: data.target_stage,
      created_at: data.created_at?.slice(0, 10) ?? "",
    };
    setForms((prev) => [form, ...prev]);
    setNewForm({ name: "", description: "", target_stage: "A fazer", project: "" });
    setShowCreateModal(false);
  }

  const STAGES = ["A fazer", "Em andamento", "Revisão", "Concluído"];
  const filtered = [...forms].sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100 bg-white shrink-0">
        <FileText size={18} className="text-brand-navy" />
        <h1 className="text-base font-semibold text-brand-navy">Formulários</h1>
        <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-neutral-400"><Lock size={11} /> Internos — exigem login</span>
        <Button onClick={() => setShowCreateModal(true)} size="sm" className="ml-auto bg-brand-navy hover:bg-brand-navy-light h-8 gap-1.5">
          <Plus size={14} /> Novo formulário
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead className="border-b border-neutral-100 bg-neutral-50/60">
                <tr className="text-left">
                  <th className="px-3 py-2.5 w-8" /><th className="px-3 py-2.5 text-xs font-medium text-neutral-400">Formulário</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-16">Ativo</th><th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-20">Portais</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-24">Respostas</th><th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-32">Etapa destino</th>
                  <th className="px-3 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="text-center py-12 text-neutral-400 text-sm">Carregando...</td></tr>
                )}
                {!loading && filtered.map((form) => (
                  <Fragment key={form.id}>
                    <tr className="border-b border-neutral-50 hover:bg-neutral-50/60">
                      <td className="px-3 py-2.5"><button onClick={() => patch(form.id, { is_favorite: !form.is_favorite })} title="Favoritar" className={cn(form.is_favorite ? "text-brand-yellow" : "text-neutral-200 hover:text-brand-yellow")}><Star size={14} fill={form.is_favorite ? "currentColor" : "none"} /></button></td>
                      <td className="px-3 py-2.5">
                        {editingNameId === form.id ? (
                          <input
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onBlur={() => saveName(form.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveName(form.id);
                              if (e.key === "Escape") { setEditingNameId(null); setEditNameValue(""); }
                            }}
                            className="text-sm font-medium text-brand-navy border border-brand-teal rounded px-1.5 py-0.5 outline-none w-full max-w-[260px]"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <Link href={"/company/forms/" + form.id + "/edit"} className="text-sm font-medium text-brand-navy hover:text-brand-teal">{form.name}</Link>
                            <button
                              onClick={() => startRename(form.id, form.name)}
                              title="Renomear"
                              className="opacity-0 group-hover/name:opacity-100 w-5 h-5 flex items-center justify-center rounded text-neutral-300 hover:text-brand-teal transition-all"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-neutral-400 truncate max-w-[260px]">{form.description}</p>
                      </td>
                      <td className="px-3 py-2.5"><button onClick={() => patch(form.id, { is_active: !form.is_active })} className={cn("w-7 h-3.5 rounded-full relative transition-all", form.is_active ? "bg-brand-teal" : "bg-neutral-200")}><span className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all", form.is_active ? "left-[15px]" : "left-0.5")} /></button></td>
                      <td className="px-3 py-2.5"><button onClick={() => setConfigId(configId === form.id ? null : form.id)} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-teal">{form.portals} portal{form.portals !== 1 ? "is" : ""}</button></td>
                      <td className="px-3 py-2.5"><button onClick={() => setShowResponsesModal(form)} className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-brand-teal"><MessageSquare size={11} /> {form.responses}</button></td>
                      <td className="px-3 py-2.5"><select value={form.target_stage} onChange={(e) => patch(form.id, { target_stage: e.target.value })} className="text-xs border border-neutral-200 rounded-md px-1.5 py-1 bg-white outline-none focus:border-brand-teal">{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1">
                        <button onClick={() => setShowResponsesModal(form)} title="Ver respostas" className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-teal"><Eye size={13} /></button>
                        <button onClick={() => copyLink(form.id)} title="Copiar link do formulário" className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-teal">{copied === form.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}</button>
                        <button onClick={() => setConfigId(configId === form.id ? null : form.id)} title="Configurar" className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-navy"><ChevronDown size={13} /></button>
                        <button onClick={() => deleteForm(form.id, form.name)} title="Excluir formulário" className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"><Trash2 size={13} /></button>
                      </div></td>
                    </tr>
                    {configId === form.id && (
                      <tr className="bg-neutral-50/60 border-b border-neutral-100"><td /><td colSpan={6} className="px-3 py-3"><div className="flex items-center gap-4 flex-wrap text-xs">
                        <label className="flex items-center gap-1.5 text-neutral-500"><input type="checkbox" checked={form.is_active} onChange={() => patch(form.id, { is_active: !form.is_active })} className="accent-brand-teal w-3 h-3" /> Ativo (recebendo respostas)</label>
                        <span className="text-neutral-500 flex items-center gap-1.5">Portais vinculados: <input type="number" min={0} value={form.portals} onChange={(e) => patch(form.id, { portals: parseInt(e.target.value) || 0 })} className="w-14 border border-neutral-200 rounded px-1.5 py-0.5 outline-none focus:border-brand-teal" /></span>
                        <button onClick={() => copyLink(form.id)} className="flex items-center gap-1 text-brand-teal hover:underline">{copied === form.id ? <Check size={12} /> : <Copy size={12} />} Copiar link do formulário (requer login)</button>
                      </div></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length === 0 && (<div className="text-center py-16 text-neutral-400"><FileText size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum formulário encontrado.</p></div>)}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold text-brand-navy">Novo formulário</h2><button onClick={() => setShowCreateModal(false)} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button></div>
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-neutral-600 mb-1">Nome do formulário *</label><input autoFocus value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && createForm()} placeholder="Ex: Solicitação de nova tarefa" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20" /></div>
              <div><label className="block text-xs font-medium text-neutral-600 mb-1">Descrição</label><textarea value={newForm.description} onChange={(e) => setNewForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descreva o objetivo deste formulário" rows={2} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20 resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-neutral-600 mb-1">Projeto</label><input value={newForm.project} onChange={(e) => setNewForm((p) => ({ ...p, project: e.target.value }))} placeholder="Ex: Marketing Digital" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-teal" /></div>
                <div><label className="block text-xs font-medium text-neutral-600 mb-1">Etapa destino</label><select value={newForm.target_stage} onChange={(e) => setNewForm((p) => ({ ...p, target_stage: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-teal bg-white">{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <p className="text-[11px] text-neutral-400 flex items-center gap-1.5"><Lock size={11} /> Todo formulário é interno: só usuários com conta logada podem enviar, e a tarefa é criada em nome de quem enviou.</p>
            </div>
            <div className="flex gap-2 mt-6"><Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)} className="flex-1">Cancelar</Button><Button size="sm" onClick={createForm} disabled={!newForm.name.trim() || creating} className="flex-1 bg-brand-navy hover:bg-brand-navy-light">{creating ? "Criando..." : "Criar formulário"}</Button></div>
          </div>
        </div>
      )}

      {showResponsesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowResponsesModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100"><div><h2 className="text-base font-semibold text-brand-navy">{showResponsesModal.name}</h2><p className="text-xs text-neutral-400 mt-0.5">Respostas recebidas</p></div><button onClick={() => setShowResponsesModal(null)} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button></div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-neutral-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-brand-navy">{showResponsesModal.responses}</div><div className="text-xs text-neutral-400 mt-0.5">Total respostas</div></div>
                <div className="bg-neutral-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-brand-teal">{showResponsesModal.is_active ? "Ativo" : "Pausado"}</div><div className="text-xs text-neutral-400 mt-0.5">Status</div></div>
                <div className="bg-neutral-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-brand-navy">{showResponsesModal.target_stage}</div><div className="text-xs text-neutral-400 mt-0.5">Etapa destino</div></div>
              </div>
              <h3 className="text-xs font-medium text-neutral-500 mb-3 uppercase tracking-wide">Últimas respostas</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {showResponsesModal.responses > 0 ? Array.from({ length: Math.min(showResponsesModal.responses, 5) }, (_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-brand-teal/20 text-brand-teal text-[10px] font-bold flex items-center justify-center">{String.fromCharCode(65 + (i % 26))}</div><span className="text-xs text-neutral-600">Resposta #{showResponsesModal.responses - i}</span></div><div className="flex items-center gap-1.5 text-xs text-neutral-400"><Calendar size={10} />{new Date(Date.now() - i * 86400000 * 2).toLocaleDateString("pt-BR")}</div></div>
                )) : (<div className="text-center py-8 text-neutral-400"><p className="text-xs">Nenhuma resposta ainda</p></div>)}
              </div>
              {showResponsesModal.responses > 5 && (<p className="text-xs text-neutral-400 mt-3 text-center">+ {showResponsesModal.responses - 5} respostas anteriores</p>)}
            </div>
            <div className="px-6 py-4 border-t border-neutral-100"><Link href={"/company/forms/" + showResponsesModal.id + "/edit"} className="w-full inline-flex items-center justify-center gap-2 bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-navy-light transition-colors"><Pencil size={13} /> Editar formulário</Link></div>
          </div>
        </div>
      )}
    </div>
  );
}
