'use client';

import { use, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

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
  const [notFound, setNotFound] = useState(false);
  const [boardProjects, setBoardProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    try {
      const storedFields = JSON.parse(localStorage.getItem(`mwr_form_fields_${slug}`) ?? '[]');
      setFields(storedFields);
      const forms: any[] = JSON.parse(localStorage.getItem('mwr_forms') ?? '[]');
      const form = forms.find((x: any) => x.id === slug);
      if (form) {
        setMeta({
          name: form.name,
          description: form.description ?? '',
          stage: form.target_stage ?? 'A fazer',
          project_id: form.project_id,
          board_id: form.board_id,
          assignee_id: form.assignee_id,
          assignee_name: form.assignee_name,
        });
        // Load board projects for board_project field type
        const boardId = form.board_id || form.project_id;
        if (boardId) {
          try {
            const bp = JSON.parse(localStorage.getItem(`mwr_board_projects_${boardId}`) ?? '[]');
            setBoardProjects(bp);
          } catch {}
        }
      } else if (storedFields.length === 0) {
        setNotFound(true);
      } else {
        setMeta({ name: 'Formulário', description: '', stage: 'A fazer' });
      }
    } catch {
      setNotFound(true);
    }
  }, [slug]);

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const titleField = effectiveFields.find(f => f.maps_to === 'title');
      const title = (titleField && values[titleField.id]) || meta?.name || 'Solicitação via formulário';

      // Separate fields into: native task fields vs custom (go to description)
      const nativeExtras: Record<string, any> = {};
      let plainDescription: string | null = null;
      const customLines: string[] = [];

      effectiveFields.forEach(f => {
        if (f.type === 'divider' || f.maps_to === 'title') return;
        const val = values[f.id]?.trim();
        if (!val) return;

        if (f.maps_to === 'description') {
          // Goes as plain briefing text (no label prefix)
          plainDescription = val;
        } else if (f.maps_to && NATIVE_MAPS.has(f.maps_to)) {
          // Map directly to task field
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
          // Custom field — build HTML label: value line for description
          customLines.push(`<p><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(val)}</p>`);
        }
      });

      // Combine description: briefing first (if any), then custom fields
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

      const projects: any[] = JSON.parse(localStorage.getItem('mwr_projects') ?? '[]');
      const columns: any[] = JSON.parse(localStorage.getItem('mwr_columns') ?? '[]');

      // Determine project: prefer board_id, then project_id, then first available
      const project_id = meta?.board_id || meta?.project_id || projects[0]?.id;

      if (project_id) {
        // Find target column by stage name within the correct project
        const col = columns.find(c => c.project_id === project_id && c.name === meta?.stage)
          ?? columns.find(c => c.project_id === project_id);

        const tasks: any[] = JSON.parse(localStorage.getItem('mwr_tasks') ?? '[]');
        const now = new Date().toISOString();

        // extraFields alias kept for due_date compat below
        const extraFields = nativeExtras;

        // Apply automation: assignee from form config
        const assignee_id = meta?.assignee_id || null;

        tasks.push({
          id: 'task-form-' + Math.random().toString(36).slice(2, 9),
          project_id,
          column_id: col?.id ?? 'col-0',
          org_id: '00000000-0000-0000-0000-000000000001',
          title,
          description,
          // Defaults — overridden below by nativeExtras
          priority: 'medium',
          position: Date.now() % 100000,
          assignee_id,
          due_date: null,
          estimated_hours: null,
          tracked_hours: 0,
          created_by: null,
          created_at: now,
          updated_at: now,
          is_urgent: false,
          status: 'open',
          type_id: null,
          sla_minutes: null,
          parent_task_id: null,
          priority_number: null,
          requesting_area_id: null,
          requested_area_id: null,
          desired_start_date: null,
          start_date: null,
          delivery_date: null,
          recurrence_config: null,
          form_id: slug,
          form_source: 'external',
          // Native form fields override defaults
          ...nativeExtras,
        });
        localStorage.setItem('mwr_tasks', JSON.stringify(tasks));

        // Save form response
        const responses: any[] = JSON.parse(localStorage.getItem(`mwr_form_responses_${slug}`) ?? '[]');
        responses.push({
          id: 'resp-' + Math.random().toString(36).slice(2, 9),
          form_id: slug,
          submitted_at: now,
          values,
          task_id: tasks[tasks.length - 1]?.id,
        });
        localStorage.setItem(`mwr_form_responses_${slug}`, JSON.stringify(responses));

        // Update response count on the form
        const forms: any[] = JSON.parse(localStorage.getItem('mwr_forms') ?? '[]');
        const formIdx = forms.findIndex(f => f.id === slug);
        if (formIdx >= 0) {
          forms[formIdx].responses = (forms[formIdx].responses || 0) + 1;
          localStorage.setItem('mwr_forms', JSON.stringify(forms));
        }
      }
    } catch (err) {
      console.error('Error creating task from form:', err);
    }
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

        <button
          type="submit"
          className="mt-6 bg-brand-navy text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 transition"
        >
          Enviar solicitação
        </button>
      </form>
    </div>
  );
}
