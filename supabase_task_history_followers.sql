-- ════════════════════════════════════════════════════════════════════════════
-- Histórico da task + Seguidores + Sequência de responsáveis
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. HISTÓRICO (task_activity) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_activity (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id     UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id    UUID,
  user_name  TEXT,
  action     TEXT        NOT NULL,
  field      TEXT,
  from_value TEXT,
  to_value   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON public.task_activity(task_id, created_at DESC);

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_activity_org_read ON public.task_activity;
CREATE POLICY task_activity_org_read ON public.task_activity FOR SELECT TO authenticated
USING (org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid()));

-- Trigger: registra automaticamente toda alteração relevante em tasks
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname TEXT;
  uid   UUID := auth.uid();
BEGIN
  SELECT full_name INTO uname FROM public.profiles WHERE id = uid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Tarefa criada');
    RETURN NEW;
  END IF;

  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Mudou a etapa', 'etapa',
      (SELECT name FROM public.columns WHERE id = OLD.column_id),
      (SELECT name FROM public.columns WHERE id = NEW.column_id));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Mudou a situação', 'situacao', OLD.status, NEW.status);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Mudou a prioridade', 'prioridade', OLD.priority, NEW.priority);
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Mudou o responsável', 'responsavel',
      (SELECT full_name FROM public.profiles WHERE id = OLD.assignee_id),
      (SELECT full_name FROM public.profiles WHERE id = NEW.assignee_id));
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Mudou o prazo', 'prazo', OLD.due_date::text, NEW.due_date::text);
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_activity(task_id, org_id, user_id, user_name, action, field, from_value, to_value)
    VALUES (NEW.id, NEW.org_id, uid, uname, 'Renomeou a tarefa', 'titulo', OLD.title, NEW.title);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_activity_upd ON public.tasks;
CREATE TRIGGER trg_log_task_activity_upd
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

DROP TRIGGER IF EXISTS trg_log_task_activity_ins ON public.tasks;
CREATE TRIGGER trg_log_task_activity_ins
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- ── 2. SEGUIDORES (task_followers) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_followers (
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_followers_all ON public.task_followers;
CREATE POLICY task_followers_all ON public.task_followers FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ── 3. SEQUÊNCIA DE RESPONSÁVEIS (task_sequences) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.task_sequences (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_position INT         NOT NULL DEFAULT 0,
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_sequences_task ON public.task_sequences(task_id, order_position);
ALTER TABLE public.task_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_sequences_all ON public.task_sequences;
CREATE POLICY task_sequences_all ON public.task_sequences FOR ALL TO authenticated
USING (true) WITH CHECK (true);
