'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { ORG_ID } from '@/lib/utils';

// Columns that actually exist on public.tasks and are safe to set from a form
// submission. Anything else in nativeExtras (e.g. "type", "board_project_id")
// is dropped so a stray field can't 400 the whole insert.
const ALLOWED_TASK_COLUMNS = new Set<string>([
  'title', 'description', 'priority', 'position', 'assignee_id',
  'due_date', 'estimated_hours', 'is_urgent', 'status', 'type_id',
  'requesting_area_id', 'requested_area_id', 'desired_start_date',
  'start_date', 'delivery_date', 'sla_minutes', 'parent_task_id',
  'priority_number', 'form_id',
]);

export async function submitFormToSupabase(input: {
  title: string;
  description: string | null;
  board_id: string;
  stage_name: string;
  assignee_id: string | null;
  form_id: string;
  nativeExtras: Record<string, unknown>;
}) {
  const admin = createAdminClient();

  // Find the target column by name within the board
  const { data: namedCol } = await (admin as any)
    .from('columns')
    .select('id')
    .eq('project_id', input.board_id)
    .eq('name', input.stage_name)
    .maybeSingle();

  // Fallback: first column by position
  const columnId: string | null = namedCol?.id ?? (await (admin as any)
    .from('columns')
    .select('id')
    .eq('project_id', input.board_id)
    .order('position')
    .limit(1)
    .maybeSingle()).data?.id ?? null;

  if (!columnId) throw new Error('No column found for this board');

  // Keep only recognised task columns from the form's native field mappings.
  const safeExtras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.nativeExtras)) {
    if (ALLOWED_TASK_COLUMNS.has(k)) safeExtras[k] = v;
  }

  const now = new Date().toISOString();
  const { error } = await (admin as any).from('tasks').insert({
    project_id: input.board_id,
    column_id: columnId,
    org_id: ORG_ID,
    title: input.title,
    description: input.description,
    priority: 'medium',
    position: Date.now() % 100000,
    assignee_id: input.assignee_id,
    status: 'open',
    created_at: now,
    updated_at: now,
    is_urgent: false,
    form_id: input.form_id,
    ...safeExtras,
  });

  if (error) throw error;
}
