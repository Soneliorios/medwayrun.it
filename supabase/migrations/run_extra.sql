-- ════════════════════════════════════════════════════════════════════
--  MedwayRun — MIGRATION EXTRA (colunas e tabelas extras)
--  Cole e execute no Supabase > SQL Editor APÓS run_all.sql
-- ════════════════════════════════════════════════════════════════════

-- ── Colunas extras em tasks ───────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reopen_count   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopen_history JSONB,
  ADD COLUMN IF NOT EXISTS delivery_link  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_note  TEXT;

-- ── Coluna extras em columns ──────────────────────────────────────────
ALTER TABLE public.columns
  ADD COLUMN IF NOT EXISTS wip_limit INTEGER;

-- ── time_entries.task_id nullable (para entradas manuais sem task) ───
ALTER TABLE public.time_entries ALTER COLUMN task_id DROP NOT NULL;

-- ── Board subprojects ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_subprojects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#407EC9',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.board_subprojects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_subprojects_all" ON public.board_subprojects FOR ALL
  USING (board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS board_subproject_id UUID REFERENCES public.board_subprojects(id) ON DELETE SET NULL;

-- ── Task approvals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_title   TEXT        NOT NULL,
  approver_id  UUID        NOT NULL REFERENCES auth.users(id),
  requested_by UUID        NOT NULL REFERENCES auth.users(id),
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','adjustment')),
  comment      TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

ALTER TABLE public.task_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_approvals_all" ON public.task_approvals FOR ALL
  USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));

-- ── Índices extras ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_board_subprojects_board ON public.board_subprojects(board_id);
CREATE INDEX IF NOT EXISTS idx_task_approvals_task    ON public.task_approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_task_approvals_status  ON public.task_approvals(status) WHERE status = 'pending';
