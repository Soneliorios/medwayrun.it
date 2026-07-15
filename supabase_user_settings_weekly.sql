-- ════════════════════════════════════════════════════════════════════════════
-- Meta SEMANAL do timesheet por usuário (personalizável; pode ser definida pelo
-- líder via painel admin, ou pelo próprio usuário no timesheet).
-- Se null, o app usa a meta diária × 5. Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS weekly_goal_hours NUMERIC;
