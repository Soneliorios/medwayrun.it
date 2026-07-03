'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Copy, Check, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, User, Save } from 'lucide-react';
import { Type, AlignLeft, CircleDot, CheckSquare, Calendar, Hash, Upload, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, ORG_ID } from '@/lib/utils';

const FIELD_TYPES = [
  { type: 'text', label: 'Texto curto', icon: Type },
  { type: 'textarea', label: 'Texto longo', icon: AlignLeft },
  { type: 'select', label: 'Seleção única', icon: CircleDot },
  { type: 'multiselect', label: 'Múltipla escolha', icon: CheckSquare },
  { type: 'date', label: 'Data', icon: Calendar },
  { type: 'number', label: 'Número', icon: Hash },
  { type: 'file', label: 'Upload de arquivo', icon: Upload },
  { type: 'divider', label: 'Divisor de seção', icon: Minus },
];

const PREMAPPED = [
  // Identidade
  { label: 'Título da tarefa', maps_to: 'title', type: 'text' },
  { label: 'Descrição / briefing', maps_to: 'description', type: 'textarea' },
  // Obrigatório
  { label: 'Projeto', maps_to: 'board_project_id', type: 'board_project', required: true },
  // Classificação
  { label: 'Tipo de tarefa', maps_to: 'type', type: 'select', options: ['Padrão', 'Bug', 'Feature', 'Melhoria'] },
  { label: 'Prioridade', maps_to: 'priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'] },
  { label: 'Urgente', maps_to: 'is_urgent', type: 'select', options: ['Sim', 'Não'] },
  { label: 'Número de prioridade', maps_to: 'priority_number', type: 'number' },
  // Datas
  { label: 'Prazo desejado', maps_to: 'desired_delivery_date', type: 'date' },
  { label: 'Data de início desejada', maps_to: 'desired_start_date', type: 'date' },
];

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  width: 'full' | 'half';
  options?: string[];
  maps_to?: string;
  description?: string;
}

interface Project { id: string; name: string; }
interface Column { id: string; name: string; project_id: string; position: number; }
interface OrgMember { id: string; user_id: string; name: string; }

const DEFAULT_FIELDS: FormField[] = [
  { id: 'f1', type: 'text', label: 'Título da solicitação', required: true, width: 'full', maps_to: 'title' },
  { id: 'f2', type: 'textarea', label: 'Descrição / briefing', required: false, width: 'full', maps_to: 'description' },
];

function Cfg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-neutral-700"
    >
      <span className={`relative inline-flex h-5 w-9 rounded-full transition ${checked ? 'bg-brand-teal' : 'bg-neutral-200'}`}>
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      {label}
    </button>
  );
}

export default function FormEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState('Formulário');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState('');
  const [active, setActive] = useState(true);
  const [internal, setInternal] = useState(true);
  const [external, setExternal] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // New: project/board and assignee automation
  const [projects, setProjects] = useState<Project[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [assigneeName, setAssigneeName] = useState<string>('');
  const [boardProjects, setBoardProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  async function loadBoardProjects(boardId: string) {
    if (!boardId) { setBoardProjects([]); return; }
    try {
      const supabase = createClient();
      const { data } = await (supabase as any)
        .from('board_subprojects')
        .select('id, name, color')
        .eq('project_id', boardId)
        .order('name');
      setBoardProjects((data ?? []) as { id: string; name: string; color: string }[]);
    } catch { setBoardProjects([]); }
  }

  // Load projects + form config on mount
  useEffect(() => {
    async function loadData() {
      const supabase = createClient();

      // Projects from Supabase
      const { data: projData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('org_id', ORG_ID)
        .eq('is_archived', false)
        .order('name');
      const projs: Project[] = (projData ?? []) as Project[];
      setProjects(projs);

      // Form config from Supabase
      const { data: formData } = await (supabase as any)
        .from('forms')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (formData) {
        setName(formData.name ?? 'Formulário');
        setDescription(formData.description ?? '');
        setStage(formData.target_stage ?? '');
        setActive(formData.is_active ?? true);
        setExternal(formData.external_access ?? false);
        setInternal(formData.internal_access ?? true);
        const boardId = formData.board_id || projs[0]?.id || '';
        setSelectedProjectId(boardId);
        if (boardId) loadBoardProjects(boardId);
        setAssigneeId(formData.assignee_id || '');
        setAssigneeName(formData.assignee_name || '');
        const savedFields: FormField[] = Array.isArray(formData.fields) && formData.fields.length > 0
          ? formData.fields
          : DEFAULT_FIELDS;
        setFields(savedFields);
      } else {
        // New form not yet saved — use defaults
        setFields(DEFAULT_FIELDS);
        if (projs.length > 0) setSelectedProjectId(projs[0].id);
      }
    }

    loadData();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load columns from Supabase whenever selected project changes
  useEffect(() => {
    if (!selectedProjectId) { setColumns([]); return; }

    async function loadColumns() {
      const supabase = createClient();
      const { data } = await supabase
        .from('columns')
        .select('id, name, project_id, position')
        .eq('project_id', selectedProjectId)
        .order('position');
      const cols = (data ?? []) as Column[];
      setColumns(cols);
      // Reset stage to first column if current value isn't valid for this board
      if (cols.length > 0) {
        setStage((prev: string) => cols.some((c) => c.name === prev) ? prev : cols[0].name);
      }
    }

    loadColumns();
    loadBoardProjects(selectedProjectId);
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load org members from Supabase
  useEffect(() => {
    async function loadOrgMembers() {
      // Primary source: the admin API (service role → real names, no RLS gaps).
      try {
        const res = await fetch('/api/admin/users');
        if (res.ok) {
          const users = (await res.json()) as { id: string; full_name: string }[];
          if (Array.isArray(users) && users.length > 0) {
            setOrgMembers(users.map((u) => ({ id: u.id, user_id: u.id, name: u.full_name })));
            return;
          }
        }
      } catch { /* fall through to direct query */ }

      // Fallback: direct members + profiles join.
      const supabase = createClient();
      const { data } = await supabase
        .from('members')
        .select('id, user_id, profiles(id, full_name)')
        .eq('org_id', ORG_ID)
        .order('joined_at');
      if (data) {
        setOrgMembers(
          (data as any[]).map((m) => ({
            id: m.id,
            user_id: m.user_id,
            name: (m.profiles as any)?.full_name ?? m.user_id.slice(0, 8),
          }))
        );
      }
    }
    loadOrgMembers();
  }, []);

  function persist(next: FormField[]) {
    setFields(next);
  }

  async function saveForm() {
    try {
      const supabase = createClient();
      const member = orgMembers.find(m => m.user_id === assigneeId);
      const { error } = await (supabase as any)
        .from('forms')
        .upsert({
          id,
          org_id: ORG_ID,
          name,
          description: description || null,
          target_stage: stage,
          is_active: active,
          external_access: external,
          internal_access: internal,
          board_id: selectedProjectId || null,
          assignee_id: assigneeId || null,
          assignee_name: member?.name || null,
          fields,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) { console.error('[form editor] save error:', error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving form:', err);
    }
  }

  function addField(type: string) {
    const ft = FIELD_TYPES.find(t => t.type === type);
    const f: FormField = {
      id: Math.random().toString(36).slice(2),
      type,
      label: ft?.label ?? type,
      required: false,
      width: 'full',
      options: type === 'select' || type === 'multiselect' ? ['Opção 1', 'Opção 2'] : undefined,
    };
    persist([...fields, f]);
    setSelected(f.id);
  }

  function addPremapped(p: typeof PREMAPPED[0]) {
    // If already in the form, select it so the user sees it highlighted
    const existing = fields.find(f => f.maps_to === p.maps_to);
    if (existing) { setSelected(existing.id); return; }
    const f: FormField = {
      id: Math.random().toString(36).slice(2),
      type: p.type,
      label: p.label,
      required: (p as any).required ?? false,
      width: 'full',
      maps_to: p.maps_to,
      options: (p as any).options,
    };
    persist([...fields, f]);
    setSelected(f.id);
  }

  function update(fid: string, u: Partial<FormField>) {
    persist(fields.map(f => f.id === fid ? { ...f, ...u } : f));
  }

  function remove(fid: string) {
    persist(fields.filter(f => f.id !== fid));
    if (selected === fid) setSelected(null);
  }

  function move(fid: string, dir: -1 | 1) {
    const i = fields.findIndex(f => f.id === fid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }

  const sel = fields.find(f => f.id === selected) ?? null;
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/forms/${id}` : '';

  // Columns for selected project
  const projectColumns = columns.filter(c => c.project_id === selectedProjectId);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-neutral-100 bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/company/forms" className="flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-navy shrink-0">
            <ChevronLeft size={13} /> Formulários
          </Link>
          <span className="text-xs text-neutral-300">/</span>
          <span className="text-xs text-brand-navy font-medium truncate">{name}</span>
        </div>
        <button
          onClick={saveForm}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-teal text-white rounded-lg hover:opacity-90 transition"
        >
          {saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Config */}
        <aside className="w-[33%] min-w-[300px] shrink-0 border-r border-neutral-100 bg-white overflow-y-auto p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Configuração</p>

          <Cfg label="Nome do formulário">
            <input value={name} onChange={e => setName(e.target.value)} className="cfg-input w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal" />
          </Cfg>

          <Cfg label="Descrição/instrução">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="cfg-input w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal resize-none" />
          </Cfg>

          <Cfg label="Quadro destino (board)">
            <select
              value={selectedProjectId}
              onChange={e => { setSelectedProjectId(e.target.value); loadBoardProjects(e.target.value); }}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal"
            >
              <option value="">Selecione um quadro...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Cfg>

          <Cfg label="Etapa destino">
            <select
              value={stage}
              onChange={e => setStage(e.target.value)}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal"
              disabled={projectColumns.length === 0}
            >
              {projectColumns.length === 0
                ? <option value="">Selecione um quadro primeiro...</option>
                : projectColumns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
              }
            </select>
          </Cfg>

          {/* Automation: assign to person */}
          <div className="border border-neutral-100 rounded-lg p-3 space-y-2 bg-neutral-50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1">
              <User size={11} /> Automação: Responsável
            </p>
            <p className="text-[11px] text-neutral-500">Ao receber uma resposta, atribuir automaticamente a tarefa para:</p>
            <select
              value={assigneeId}
              onChange={e => {
                setAssigneeId(e.target.value);
                const m = orgMembers.find(m => m.user_id === e.target.value);
                setAssigneeName(m?.name || '');
              }}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal bg-white"
            >
              <option value="">Ninguém (sem atribuição automática)</option>
              {orgMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
            {assigneeId && (
              <p className="text-[11px] text-brand-teal">✓ Tarefas serão atribuídas a {assigneeName}</p>
            )}
          </div>

          <div className="space-y-1.5 pt-1">
            <Toggle label="Ativo" checked={active} onChange={setActive} />
            <Toggle label="Acesso interno" checked={internal} onChange={setInternal} />
            <Toggle label="Acesso externo (link público)" checked={external} onChange={setExternal} />
          </div>

          {external && (
            <div className="bg-neutral-50 rounded-lg p-2 flex items-center gap-1.5">
              <input readOnly value={publicUrl} className="flex-1 text-[10px] bg-transparent outline-none text-neutral-500" />
              <button
                onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="text-brand-teal"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}

          {/* Pre-mapped fields */}
          <div className="pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Campos pré-mapeados</p>
            <div className="space-y-1">
              {PREMAPPED.map(p => {
                const alreadyAdded = fields.some(f => f.maps_to === p.maps_to);
                return (
                  <button
                    key={p.maps_to}
                    onClick={() => addPremapped(p)}
                    className={cn(
                      "w-full flex items-center justify-between text-xs rounded px-2 py-1.5 border transition-colors",
                      alreadyAdded
                        ? "border-brand-teal/30 bg-brand-teal/5 text-brand-teal cursor-pointer"
                        : "border-neutral-100 text-neutral-600 hover:bg-neutral-50"
                    )}
                    title={alreadyAdded ? "Já adicionado — clique para selecionar" : "Adicionar campo"}
                  >
                    {p.label}
                    {alreadyAdded
                      ? <Check size={11} className="text-brand-teal shrink-0" />
                      : <Plus size={11} className="text-brand-teal shrink-0" />
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add fields */}
          <div className="pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Adicionar campo</p>
            <div className="grid grid-cols-2 gap-1">
              {FIELD_TYPES.map(ft => (
                <button key={ft.type} onClick={() => addField(ft.type)} className="flex items-center gap-1.5 text-[11px] text-neutral-600 hover:bg-brand-teal/5 hover:text-brand-teal rounded px-2 py-1.5 border border-neutral-100">
                  <ft.icon size={11} /> {ft.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center - Form canvas */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-100 p-8">
            <div className="w-9 h-9 rounded-lg bg-brand-teal flex items-center justify-center text-white font-bold mb-4">M</div>
            <h1 className="text-xl font-bold text-brand-navy">{name}</h1>
            {description && <p className="text-sm text-neutral-500 mt-1 mb-4">{description}</p>}

            {/* Fields list */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              {fields.length === 0 && (
                <div className="col-span-2 text-center py-8 text-neutral-300 border-2 border-dashed border-neutral-100 rounded-xl">
                  <p className="text-sm">Adicione campos no painel esquerdo</p>
                  <p className="text-xs mt-1">Por padrão, o formulário mostra Título e Descrição</p>
                </div>
              )}
              {fields.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  className={`${f.width === 'half' ? 'col-span-1' : 'col-span-2'} border rounded-lg p-3 cursor-pointer transition ${selected === f.id ? 'border-brand-teal bg-brand-teal/5' : 'border-neutral-100 hover:border-neutral-200'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-neutral-700">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </span>
                    <span className="text-[10px] text-neutral-400">{f.type}</span>
                  </div>
                  {f.type === 'textarea' ? (
                    <div className="h-10 bg-neutral-50 rounded border border-neutral-100 text-xs text-neutral-300 p-2">Área de texto...</div>
                  ) : f.type === 'divider' ? (
                    <hr className="border-neutral-200" />
                  ) : f.type === 'board_project' ? (
                    <div className="h-7 bg-neutral-50 rounded border border-neutral-100 flex items-center px-2 gap-1.5">
                      <span className="text-[10px] text-neutral-400">
                        {boardProjects.length > 0 ? `${boardProjects.length} projeto(s) do quadro` : 'Projetos carregados do quadro'}
                      </span>
                    </div>
                  ) : (
                    <div className="h-7 bg-neutral-50 rounded border border-neutral-100" />
                  )}
                </div>
              ))}
            </div>

            <button type="button" className="mt-6 bg-brand-navy text-white text-sm font-medium rounded-lg px-5 py-2.5 opacity-50 cursor-not-allowed">
              Enviar solicitação
            </button>
          </div>
        </main>

        {/* Right sidebar - Field editor */}
        {sel && (
          <aside className="w-72 shrink-0 border-l border-neutral-100 bg-white overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Editar campo</p>
              <div className="flex items-center gap-1">
                <button onClick={() => move(sel.id, -1)} className="text-neutral-400 hover:text-brand-navy p-1"><ArrowUp size={13} /></button>
                <button onClick={() => move(sel.id, 1)} className="text-neutral-400 hover:text-brand-navy p-1"><ArrowDown size={13} /></button>
                <button onClick={() => remove(sel.id)} className="text-neutral-400 hover:text-destructive p-1"><Trash2 size={13} /></button>
              </div>
            </div>

            <Cfg label="Rótulo">
              <input value={sel.label} onChange={e => update(sel.id, { label: e.target.value })} className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal" />
            </Cfg>

            <Cfg label="Placeholder/instrução">
              <input value={sel.description ?? ''} onChange={e => update(sel.id, { description: e.target.value })} className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal" />
            </Cfg>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="req" checked={sel.required} onChange={e => update(sel.id, { required: e.target.checked })} />
              <label htmlFor="req" className="text-sm text-neutral-700">Obrigatório</label>
            </div>

            <Cfg label="Largura">
              <div className="flex gap-2">
                {(['full', 'half'] as const).map(w => (
                  <button key={w} onClick={() => update(sel.id, { width: w })} className={`flex-1 text-xs py-1.5 rounded border ${sel.width === w ? 'border-brand-teal text-brand-teal bg-brand-teal/5' : 'border-neutral-200 text-neutral-500'}`}>
                    {w === 'full' ? 'Linha inteira' : 'Metade'}
                  </button>
                ))}
              </div>
            </Cfg>

            {sel.type === 'board_project' && (
              <div className="text-[11px] bg-brand-teal/5 border border-brand-teal/20 rounded-lg px-2.5 py-2 text-brand-teal space-y-0.5">
                <p className="font-semibold">Campo obrigatório da task</p>
                <p className="text-neutral-500">As opções são carregadas automaticamente dos projetos do quadro selecionado.</p>
              </div>
            )}
            {(sel.type === 'select' || sel.type === 'multiselect') && (
              <Cfg label="Opções (uma por linha)">
                <textarea
                  rows={4}
                  value={(sel.options ?? []).join('\n')}
                  onChange={e => update(sel.id, { options: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal resize-none"
                />
              </Cfg>
            )}

            {sel.maps_to && (
              <div className="text-[11px] text-brand-teal bg-brand-teal/5 rounded-lg px-2 py-1.5">
                Mapeado para: <strong>{sel.maps_to}</strong>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
