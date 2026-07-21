-- ════════════════════════════════════════════════════════════════════════════
-- Layout da task POR QUADRO (Fase 1).
--   • projects.task_layout   → config dos campos NATIVOS: { hidden:[keys], required:[keys] }
--   • board_custom_fields     → campos CUSTOMIZADOS criados pelo quadro
--   • tasks.custom_fields      → valores dos campos custom por task { [fieldId]: value }
-- Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Config dos campos nativos (o que o quadro esconde / torna obrigatório) ─────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS task_layout JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Valores dos campos custom por task ─────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3) Definições dos campos custom por quadro ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label      text NOT NULL,
  -- text | textarea | number | date | select | multiselect | checkbox | user | url
  type       text NOT NULL,
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- só para select/multiselect
  required   boolean NOT NULL DEFAULT false,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_custom_fields_project
  ON public.board_custom_fields (project_id, position);

ALTER TABLE public.board_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_custom_fields_all ON public.board_custom_fields;
CREATE POLICY board_custom_fields_all ON public.board_custom_fields
  FOR ALL
  USING (org_id = ANY (public.get_user_orgs()))
  WITH CHECK (org_id = ANY (public.get_user_orgs()));
