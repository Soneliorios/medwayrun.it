'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { ORG_ID } from '@/lib/utils';

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
    form_source: 'external',
    ...input.nativeExtras,
  });

  if (error) throw error;
}
