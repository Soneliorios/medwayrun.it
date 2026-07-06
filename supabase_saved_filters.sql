-- ════════════════════════════════════════════════════════════════════════════
-- Filtros salvos por usuário (disponíveis em todos os quadros)
-- Rodar no Supabase → SQL Editor
-- (A tabela já existia num schema anterior com a coluna filters_json.)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.saved_filters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  board_id     UUID,
  name         TEXT        NOT NULL,
  filters_json JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Garante a coluna caso a tabela já existisse sem ela
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS filters_json JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON public.saved_filters(user_id, created_at);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_filters_own ON public.saved_filters;
CREATE POLICY saved_filters_own ON public.saved_filters FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
