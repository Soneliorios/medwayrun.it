-- ════════════════════════════════════════════════════════════════════════════
-- Preferências por usuário (ex.: meta de horas do timesheet) → sair do localStorage
-- Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timesheet_goal_hours NUMERIC     NOT NULL DEFAULT 8,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_own ON public.user_settings;
CREATE POLICY user_settings_own ON public.user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
