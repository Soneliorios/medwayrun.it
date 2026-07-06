-- ════════════════════════════════════════════════════════════════════════════
-- Filtros salvos por usuário (disponíveis em todos os quadros)
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.saved_filters (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  filters    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON public.saved_filters(user_id, created_at);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_filters_own ON public.saved_filters;
CREATE POLICY saved_filters_own ON public.saved_filters FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
