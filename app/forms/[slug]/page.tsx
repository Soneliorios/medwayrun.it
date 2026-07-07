'use client';

import { use, useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { createRawClient } from '@/lib/supabase/client';
import { submitFormToSupabase } from './actions';

const FIELD_TYPES_WITH_LABEL: Record<string, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  select: 'Seleção única',
  multiselect: 'Múltipla escolha',
  date: 'Data',
  number: 'Número',
  file: 'Upload de arquivo',
  user: 'Seleção de usuário',
  divider: 'Divisor de seção',
};

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

interface FormMeta {
  name: string;
  description: string;
  stage: string;
  project_id?: string;
  board_id?: string;
  assignee_id?: string;
  assignee_name?: string;
}

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [fields, setFields] = useState<FormField[]>([]);
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileUploads, setFileUploads] = useState<Record<string, { name: string; url: string; mime: string | null; size: number | null }>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  async function handleFileUpload(fieldId: string, file: File) {
    const supabase = createRawClient();
    setUploading((u) => ({ ...u, [fieldId]: true }));
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${slug}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("task-files").upload(path, file, { upsert: false });
    if (error) {
      console.error("[form upload]", error);
      setSubmitError("Não foi possível enviar o arquivo. Tente novamente.");
    } else {
      const { data } = supabase.storage.from("task-files").getPublicUrl(path);
      setFileUploads((prev) => ({ ...prev, [fieldId]: { name: file.name, url: data.publicUrl, mime: file.type || null, size: file.size } }));
      setValues((s) => ({ ...s, [fieldId]: file.name }));
    }
    setUploading((u) => ({ ...u, [fieldId]: false }));
  }
  const [notFound, setNotFound] = useState(false);
  const [boardProjects, setBoardProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    async function loadForm() {
      const supabase = createRawClient();

      // Load form from Supabase (anon SELECT policy covers active forms)
      const { data: formData } = await (supabase as any)
        .from('forms')
        .select('*')
        .eq('id', slug)
        .maybeSingle();

      if (formData) {
        setMeta({
          name: formData.name,
          description: formData.description ?? '',
          stage: formData.target_stage ?? 'A fazer',
          project_id: formData.board_id,
          board_id: formData.board_id,
          assignee_id: formData.assignee_id,
          assignee_name: formData.assignee_name,
        });
        const savedFields: FormField[] = Array.isArray(formData.fields) && formData.fields.length > 0
          ? formData.fields
          : [
              { id: 'f_title', type: 'text', label: 'Título da solicitação', required: true, width: 'full', maps_to: 'title' },
              { id: 'f_desc', type: 'textarea', label: 'Descrição / briefing', required: false, width: 'full', maps_to: 'description' },
            ];
        setFields(savedFields);

        // Load board sub-projects
        const boardId = formData.board_id;
        if (boardId) {
          const { data: bpData } = await (supabase as any)
            .from('board_subprojects')
            .select('id, name, color')
            .eq('project_id', boardId)
            .order('name');
          if (bpData && bpData.length > 0) setBoardProjects(bpData);
        }
        return;
      }

      // Not in the database → form doesn't exist (forms are DB-backed now).
      setNotFound(true);
    }

    loadForm();
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default fields always shown if no custom fields configured
  const effectiveFields: FormField[] = fields.length > 0 ? fields : [
    { id: 'f_title', type: 'text', label: 'Título da solicitação', required: true, width: 'full', maps_to: 'title' },
    { id: 'f_desc', type: 'textarea', label: 'Descrição / briefing', required: false, width: 'full', maps_to: 'description' },
  ];

  // maps_to values that correspond to native task fields — do NOT go to description
  const NATIVE_MAPS = new Set([
    'title', 'description',
    'desired_delivery_date', 'desired_start_date',
    'priority', 'is_urgent', 'estimated_hours', 'priority_number',
    'type', 'assignee_id', 'sla_minutes', 'board_project_id', 'start_date',
  ]);

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const titleField = effectiveFields.find(f => f.maps_to === 'title');
      const title = (titleField && values[titleField.id]) || meta?.name || 'Solicitação via formulário';

      const nativeExtras: Record<string, unknown> = {};
      let plainDescription: string | null = null;
      const customLines: string[] = [];

      effectiveFields.forEach(f => {
        if (f.type === 'divider' || f.type === 'file' || f.maps_to === 'title') return;
        const val = values[f.id]?.trim();
        if (!val) return;

        if (f.maps_to === 'description') {
          plainDescription = val;
        } else if (f.maps_to && NATIVE_MAPS.has(f.maps_to)) {
          if (f.maps_to === 'desired_delivery_date') {
            nativeExtras.due_date = val;
          } else if (f.maps_to === 'desired_start_date') {
            nativeExtras.desired_start_date = val;
          } else if (f.maps_to === 'is_urgent') {
            nativeExtras.is_urgent = val === 'Sim' || val === 'true' || val === '1';
          } else if (f.maps_to === 'estimated_hours' || f.maps_to === 'sla_minutes' || f.maps_to === 'priority_number') {
            nativeExtras[f.maps_to] = parseFloat(val) || null;
          } else {
            nativeExtras[f.maps_to] = val;
          }
        } else {
          customLines.push(`<p><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(val)}</p>`);
        }
      });

      let description: string | null = null;
      const pd = plainDescription as string | null;
      const briefingHtml = pd
        ? pd.split('\n').filter(l => l.trim()).map(l => `<p>${escapeHtml(l)}</p>`).join('')
        : '';
      if (briefingHtml && customLines.length > 0) {
        description = briefingHtml + '<hr>' + customLines.join('');
      } else if (briefingHtml) {
        description = briefingHtml;
      } else if (customLines.length > 0) {
        description = customLines.join('');
      }

      const boardId = meta?.board_id || meta?.project_id;
      if (!boardId) {
        throw new Error('Este formulário não está vinculado a um quadro. Configure o quadro no editor do formulário.');
      }
      await submitFormToSupabase({
        title,
        description,
        board_id: boardId,
        stage_name: meta?.stage ?? 'A fazer',
        assignee_id: meta?.assignee_id ?? null,
        form_id: slug,
        nativeExtras,
        attachments: Object.values(fileUploads),
      });
    } catch (err) {
      console.error('Error creating task from form:', err);
      setSubmitError(
        err instanceof Error && err.message.includes('quadro')
          ? err.message
          : 'Não foi possível registrar sua solicitação. Tente novamente ou avise o responsável pelo formulário.'
      );
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setSubmitted(true);
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-400 text-sm">Formulário não encontrado.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8 text-center max-w-md">
          <CheckCircle2 size={40} className="text-brand-teal mx-auto mb-3" />
          <h1 className="text-lg font-bold text-brand-navy">Solicitação enviada!</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Recebemos sua solicitação e ela já virou uma tarefa.
            {meta?.assignee_name && ` Responsável: ${meta.assignee_name}.`} Obrigado!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <form
        onSubmit={submit}
        className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
      >
        <div className="w-9 h-9 rounded-lg bg-brand-teal flex items-center justify-center text-white font-bold mb-4">M</div>
        <h1 className="text-xl font-bold text-brand-navy">{meta?.name ?? 'Formulário'}</h1>
        {meta?.description && (
          <p className="text-sm text-neutral-500 mt-1 mb-6">{meta.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 mt-4">
          {effectiveFields.map(f => {
            if (f.type === 'divider') {
              return (
                <div key={f.id} className="col-span-2 border-t border-neutral-200 pt-2">
                  <span className="text-sm font-semibold text-neutral-600">{f.label}</span>
                </div>
              );
            }

            const set = (v: string) => setValues(s => ({ ...s, [f.id]: v }));

            return (
              <div key={f.id} className={f.width === 'half' ? 'col-span-1' : 'col-span-2'}>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    required={f.required}
                    placeholder={f.description}
                    rows={3}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal resize-none"
                  />
                ) : f.type === 'board_project' ? (
                  <select
                    required={f.required}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal"
                  >
                    <option value="">Selecionar projeto...</option>
                    {boardProjects.map(bp => (
                      <option key={bp.id} value={bp.id}>{bp.name}</option>
                    ))}
                    {boardProjects.length === 0 && (
                      <option disabled>Nenhum projeto cadastrado no quadro</option>
                    )}
                  </select>
                ) : f.type === 'select' ? (
                  <select
                    required={f.required}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal"
                  >
                    <option value="">Selecionar...</option>
                    {(f.options ?? []).map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'date' ? (
                  <input
                    type="date"
                    required={f.required}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal"
                  />
                ) : f.type === 'number' ? (
                  <input
                    type="number"
                    required={f.required}
                    placeholder={f.description}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal"
                  />
                ) : f.type === 'file' ? (
                  <div>
                    <input
                      type="file"
                      required={f.required && !fileUploads[f.id]}
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(f.id, file); }}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal file:mr-3 file:rounded-md file:border-0 file:bg-brand-navy file:text-white file:text-xs file:px-3 file:py-1.5 file:cursor-pointer"
                    />
                    {uploading[f.id] && <p className="text-xs text-neutral-400 mt-1">Enviando arquivo...</p>}
                    {fileUploads[f.id] && (
                      <p className="text-xs text-brand-teal mt-1 flex items-center gap-1">
                        <CheckCircle2 size={11} /> {fileUploads[f.id].name}
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    required={f.required}
                    placeholder={f.description}
                    onChange={e => set(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal"
                  />
                )}
              </div>
            );
          })}
        </div>

        {submitError && (
          <p className="mt-4 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 bg-brand-navy text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? 'Enviando...' : 'Enviar solicitação'}
        </button>
      </form>
    </div>
  );
}
