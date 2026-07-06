-- ════════════════════════════════════════════════════════════════════════════
-- Quadro privado (is_private + project_members) + Aprovações (task_approvals)
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. QUADRO PRIVADO ───────────────────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('viewer','member','admin')),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_members_all ON public.project_members;
CREATE POLICY project_members_all ON public.project_members FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ── 2. APROVAÇÕES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_title   TEXT,
  approver_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','adjustment')),
  comment      TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_task_approvals_task ON public.task_approvals(task_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_approvals_approver ON public.task_approvals(approver_id, status);

ALTER TABLE public.task_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_approvals_all ON public.task_approvals;
CREATE POLICY task_approvals_all ON public.task_approvals FOR ALL TO authenticated
USING (org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid()));
