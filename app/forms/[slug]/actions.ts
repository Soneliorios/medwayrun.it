'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ORG_ID } from '@/lib/utils';
import { MAX_TOTAL_FILES, MAX_FILE_BYTES } from './limits';

// Columns that actually exist on public.tasks and are safe to set from a form
// submission. Anything else in nativeExtras (e.g. "type", "board_project_id")
// is dropped so a stray field can't 400 the whole insert.
const ALLOWED_TASK_COLUMNS = new Set<string>([
  'title', 'description', 'priority', 'position', 'assignee_id',
  'due_date', 'estimated_hours', 'is_urgent', 'status', 'type_id',
  'requesting_area_id', 'requested_area_id', 'desired_start_date',
  'start_date', 'delivery_date', 'sla_minutes', 'parent_task_id',
  'priority_number', 'form_id', 'board_subproject_id',
]);

export async function submitFormToSupabase(input: {
  title: string;
  description: string | null;
  board_id: string;
  stage_name: string;
  assignee_id: string | null;
  form_id: string;
  nativeExtras: Record<string, unknown>;
  attachments?: { name: string; url: string; mime: string | null; size: number | null }[];
}) {
  // Forms are internal-only: the submitter must be a logged-in user, and the
  // resulting task is tagged with them as its creator (created_by).
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    throw new Error('Você precisa estar logado para enviar este formulário.');
  }

  const admin = createAdminClient();

  // SECURITY: don't trust the client's board_id/stage/assignee. Derive them from
  // the form record itself (by form_id), so a logged-in user can't post tasks
  // into an arbitrary board or set an arbitrary assignee (IDOR).
  const { data: form } = await (admin as any)
    .from('forms')
    .select('board_id, target_stage, assignee_id, org_id')
    .eq('id', input.form_id)
    .maybeSingle();

  if (!form || form.org_id !== ORG_ID || !form.board_id) {
    throw new Error('Formulário inválido ou sem quadro configurado.');
  }

  const boardId: string = form.board_id;
  const stageName: string = form.target_stage ?? 'A fazer';
  const assigneeId: string | null = form.assignee_id ?? null;

  // Find the target column by name within the board
  const { data: namedCol } = await (admin as any)
    .from('columns')
    .select('id')
    .eq('project_id', boardId)
    .eq('name', stageName)
    .maybeSingle();

  // Fallback: first column by position
  const columnId: string | null = namedCol?.id ?? (await (admin as any)
    .from('columns')
    .select('id')
    .eq('project_id', boardId)
    .order('position')
    .limit(1)
    .maybeSingle()).data?.id ?? null;

  if (!columnId) throw new Error('No column found for this board');

  // Keep only recognised task columns from the form's native field mappings.
  const safeExtras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.nativeExtras)) {
    if (ALLOWED_TASK_COLUMNS.has(k)) safeExtras[k] = v;
  }

  // Backstop de segurança: mesmo que o cliente burle a validação, só linkamos
  // arquivos dentro do limite de tamanho e um teto total de arquivos.
  const safeAttachments = (input.attachments ?? [])
    .filter((a) => (a.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_TOTAL_FILES);

  const now = new Date().toISOString();
  const { data: created, error } = await (admin as any).from('tasks').insert({
    project_id: boardId,
    column_id: columnId,
    org_id: ORG_ID,
    title: input.title,
    description: input.description,
    priority: 'medium',
    position: Date.now() % 100000,
    assignee_id: assigneeId,
    status: 'open',
    created_at: now,
    updated_at: now,
    is_urgent: false,
    form_id: input.form_id,
    created_by: user.id,
    ...safeExtras,
  }).select('id').single();

  if (error) throw error;

  // Linka os arquivos à tarefa e — SÓ se o link der certo — acrescenta o aviso de
  // anexos na descrição. Assim o aviso nunca mente sobre a aba "Anexos", e uma
  // falha ao anexar vira erro visível em vez de "sucesso" silencioso.
  if (created?.id && safeAttachments.length > 0) {
    const { error: attErr } = await (admin as any).from('task_attachments').insert(
      safeAttachments.map((a) => ({
        task_id: created.id,
        org_id: ORG_ID,
        name: a.name,
        url: a.url,
        mime: a.mime,
        size: a.size,
      }))
    );
    if (attErr) {
      console.error('[submitFormToSupabase] attachments insert error:', attErr);
      throw new Error('A tarefa foi criada, mas houve um erro ao anexar os arquivos. Tente reenviar.');
    }
    const count = safeAttachments.length;
    const label = count === 1 ? '1 anexo' : `${count} anexos`;
    const notice = `<p>📎 <strong>Esta tarefa possui ${label}</strong> enviado(s) pelo formulário — veja a aba <em>Anexos</em>.</p>`;
    const newDescription = input.description ? `${input.description}<hr>${notice}` : notice;
    const { error: updErr } = await (admin as any).from('tasks').update({ description: newDescription }).eq('id', created.id);
    if (updErr) console.error('[submitFormToSupabase] description notice update error:', updErr);
  }
}
