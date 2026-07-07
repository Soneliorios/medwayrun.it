-- ════════════════════════════════════════════════════════════════════
--  Board task types → move from localStorage to the database
--  Makes task_types board-scoped (project_id) with a default estimate,
--  so types sync across devices, origins and users.
--  Idempotent & non-destructive — safe to run more than once.
--  Run in the Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- Board scoping (nullable: existing org-wide rows keep project_id = NULL)
ALTER TABLE public.task_types
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Default estimated hours per type (was only in localStorage before)
ALTER TABLE public.task_types
  ADD COLUMN IF NOT EXISTS default_hours NUMERIC NOT NULL DEFAULT 2;

-- Lookup by board
CREATE INDEX IF NOT EXISTS idx_task_types_project
  ON public.task_types(project_id);

-- Prevent duplicate type names within the same board. NULL project_id rows
-- (the pre-existing org-wide seed types) are treated as distinct by Postgres,
-- so this does not conflict with them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_types_project_name
  ON public.task_types(project_id, name);

-- RLS: the existing "task_types_all" policy (org_id = ANY(get_user_orgs()))
-- already covers select/insert/update/delete for org members, so no new
-- policy is required.
