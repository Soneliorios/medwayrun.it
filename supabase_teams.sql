-- ════════════════════════════════════════════════════════════════════════════
-- Times (teams) → sair do localStorage para o banco
-- Idempotente e não-destrutivo. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.teams (
  id           TEXT        PRIMARY KEY,               -- ids curtos (nanoid) já usados no app
  org_id       UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name         TEXT        NOT NULL,
  leader_ids   UUID[]      NOT NULL DEFAULT '{}',
  member_ids   UUID[]      NOT NULL DEFAULT '{}',
  member_hours JSONB       NOT NULL DEFAULT '{}',      -- { user_id: horas_semanais }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_org ON public.teams(org_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_all ON public.teams;
CREATE POLICY teams_all ON public.teams FOR ALL TO authenticated
USING (org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid()))
WITH CHECK (org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid()));
