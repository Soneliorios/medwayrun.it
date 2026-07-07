-- ════════════════════════════════════════════════════════════════════════════
-- Requisitos por etapa: permitir o cliente gravar (só havia policy de SELECT)
-- Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS stage_req_write ON public.stage_requirements;
CREATE POLICY stage_req_write ON public.stage_requirements
  FOR ALL TO authenticated
  USING (
    column_id IN (
      SELECT c.id FROM public.columns c
      JOIN public.projects p ON p.id = c.project_id
      WHERE p.org_id = ANY(public.get_user_orgs())
    )
  )
  WITH CHECK (
    column_id IN (
      SELECT c.id FROM public.columns c
      JOIN public.projects p ON p.id = c.project_id
      WHERE p.org_id = ANY(public.get_user_orgs())
    )
  );
