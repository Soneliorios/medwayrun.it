-- ════════════════════════════════════════════════════════════════════════════
-- Registro por parte na fila de responsáveis (o que cada um entregou + tempo)
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- Baseline de horas quando a parte da pessoa começa (para calcular o delta),
-- e o que foi entregue por parte.
ALTER TABLE public.task_sequences ADD COLUMN IF NOT EXISTS part_start_hours NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.task_sequences ADD COLUMN IF NOT EXISTS hours_spent      NUMERIC;
ALTER TABLE public.task_sequences ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ;
ALTER TABLE public.task_sequences ADD COLUMN IF NOT EXISTS delivery_note    TEXT;
ALTER TABLE public.task_sequences ADD COLUMN IF NOT EXISTS delivery_link    TEXT;
