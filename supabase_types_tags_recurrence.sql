-- ════════════════════════════════════════════════════════════════════════════
-- Tipos por quadro + Tags por quadro + Recorrência (pg_cron)
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. TIPO DE TAREFA (salvar o nome escolhido) ─────────────────────────────
-- Os tipos são geridos por quadro; a task guarda o nome do tipo selecionado.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type TEXT;

-- ── 2. TAGS POR QUADRO ──────────────────────────────────────────────────────
-- labels passa a ter project_id → cada quadro tem suas próprias tags.
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_labels_project ON public.labels(project_id);

-- Garante acesso de leitura/escrita a membros autenticados (caso RLS esteja restrito)
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labels_all ON public.labels;
CREATE POLICY labels_all ON public.labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_labels_all ON public.task_labels;
CREATE POLICY task_labels_all ON public.task_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. RECORRÊNCIA (pg_cron cria as tarefas repetidas) ──────────────────────
-- recurrence_config (jsonb) já existe na tabela tasks. Formato usado pelo app:
--   { "frequency": "daily|weekly|biweekly|monthly",
--     "until": "YYYY-MM-DD" | null,   (null = indeterminado)
--     "active": true,
--     "next_run": "YYYY-MM-DD" }

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.generate_recurring_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t          RECORD;
  freq       TEXT;
  next_run   DATE;
  until_date DATE;
  target_col UUID;
  new_next   DATE;
BEGIN
  FOR t IN
    SELECT * FROM public.tasks
    WHERE recurrence_config IS NOT NULL
      AND (recurrence_config->>'active')::boolean IS TRUE
      AND (recurrence_config->>'next_run') IS NOT NULL
      AND (recurrence_config->>'next_run')::date <= CURRENT_DATE
  LOOP
    freq       := t.recurrence_config->>'frequency';
    next_run   := (t.recurrence_config->>'next_run')::date;
    until_date := NULLIF(t.recurrence_config->>'until', '')::date;

    -- Passou da data limite → desativa e segue
    IF until_date IS NOT NULL AND until_date < CURRENT_DATE THEN
      UPDATE public.tasks
      SET recurrence_config = jsonb_set(recurrence_config, '{active}', 'false')
      WHERE id = t.id;
      CONTINUE;
    END IF;

    -- Coluna destino = primeira coluna do quadro
    SELECT id INTO target_col FROM public.columns
      WHERE project_id = t.project_id ORDER BY position LIMIT 1;

    -- Cria a nova ocorrência (não recorrente)
    IF target_col IS NOT NULL THEN
      INSERT INTO public.tasks (
        project_id, column_id, org_id, title, description, priority, position,
        assignee_id, type_id, task_type, estimated_hours, is_urgent, status,
        requesting_area_id, board_subproject_id, recurrence_config
      ) VALUES (
        t.project_id, target_col, t.org_id, t.title, t.description, t.priority,
        (EXTRACT(EPOCH FROM now())::bigint % 100000),
        t.assignee_id, t.type_id, t.task_type, t.estimated_hours, t.is_urgent, 'open',
        t.requesting_area_id, t.board_subproject_id, NULL
      );
    END IF;

    -- Avança o next_run conforme a frequência
    new_next := CASE freq
      WHEN 'daily'    THEN next_run + INTERVAL '1 day'
      WHEN 'weekly'   THEN next_run + INTERVAL '7 days'
      WHEN 'biweekly' THEN next_run + INTERVAL '14 days'
      WHEN 'monthly'  THEN next_run + INTERVAL '1 month'
      ELSE next_run + INTERVAL '7 days'
    END;

    IF until_date IS NOT NULL AND new_next > until_date THEN
      UPDATE public.tasks
      SET recurrence_config = jsonb_set(recurrence_config, '{active}', 'false')
      WHERE id = t.id;
    ELSE
      UPDATE public.tasks
      SET recurrence_config = jsonb_set(recurrence_config, '{next_run}', to_jsonb(new_next::text))
      WHERE id = t.id;
    END IF;
  END LOOP;
END;
$$;

-- Agenda diária (08:00 UTC). Remove agendamento anterior se existir.
SELECT cron.unschedule('generate_recurring_tasks')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate_recurring_tasks');

SELECT cron.schedule('generate_recurring_tasks', '0 8 * * *', $$SELECT public.generate_recurring_tasks();$$);
