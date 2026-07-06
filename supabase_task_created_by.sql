-- ════════════════════════════════════════════════════════════════════════════
-- Garante criador em toda task nova (sem tocar nas existentes)
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- Qualquer INSERT autenticado que não informe created_by recebe o usuário atual.
-- (Inserts via service role — ex.: formulário público anônimo — ficam com NULL,
--  que é o comportamento correto: não há criador logado.)
ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Recorrência: as ocorrências geradas herdam o criador da task original.
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

    IF until_date IS NOT NULL AND until_date < CURRENT_DATE THEN
      UPDATE public.tasks
      SET recurrence_config = jsonb_set(recurrence_config, '{active}', 'false')
      WHERE id = t.id;
      CONTINUE;
    END IF;

    SELECT id INTO target_col FROM public.columns
      WHERE project_id = t.project_id ORDER BY position LIMIT 1;

    IF target_col IS NOT NULL THEN
      INSERT INTO public.tasks (
        project_id, column_id, org_id, title, description, priority, position,
        assignee_id, type_id, task_type, estimated_hours, is_urgent, status,
        requesting_area_id, board_subproject_id, created_by, recurrence_config
      ) VALUES (
        t.project_id, target_col, t.org_id, t.title, t.description, t.priority,
        (EXTRACT(EPOCH FROM now())::bigint % 100000),
        t.assignee_id, t.type_id, t.task_type, t.estimated_hours, t.is_urgent, 'open',
        t.requesting_area_id, t.board_subproject_id, t.created_by, NULL
      );
    END IF;

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
