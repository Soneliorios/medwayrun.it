-- ════════════════════════════════════════════════════════════════════════════
-- Preferências de UI por usuário (vistas recentes, banners, config de list/dashboard)
-- Key-value por usuário. Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_ui_prefs (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_ui_prefs_own ON public.user_ui_prefs;
CREATE POLICY user_ui_prefs_own ON public.user_ui_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
