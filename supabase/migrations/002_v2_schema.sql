-- ════════════════════════════════════════════════════════════════════
--  MedwayRun v2 — Migration 002
--  Execute AFTER 001_initial_schema.sql
-- ════════════════════════════════════════════════════════════════════

-- ── Tipos de tarefa ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_types (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#407EC9'
);

-- ── Áreas organizacionais ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name   TEXT NOT NULL
);

-- ── Multi-responsáveis (Partes de tarefa) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_order INTEGER     NOT NULL DEFAULT 0,
  delivered_at   TIMESTAMPTZ,
  UNIQUE (task_id, user_id)
);

-- ── Registro de tempo ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_minutes INTEGER,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Timer ativo por usuário (1 por vez) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.active_timers (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Filtros salvos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id     UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  filters_json JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Campos customizados por quadro ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID    NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  field_type   TEXT    NOT NULL CHECK (field_type IN ('text','number','date','select','multiselect')),
  options_json JSONB,
  is_required  BOOLEAN DEFAULT FALSE,
  position     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.task_custom_field_values (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID    NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_id     UUID    NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value_text   TEXT,
  value_number NUMERIC,
  value_date   DATE,
  value_json   JSONB,
  UNIQUE (task_id, field_id)
);

-- ── Automações ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  trigger_event   TEXT        NOT NULL,
  trigger_config  JSONB       NOT NULL DEFAULT '{}',
  action_type     TEXT        NOT NULL,
  action_config   JSONB       NOT NULL DEFAULT '{}',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  execution_count INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Requisitos de etapa ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stage_requirements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id  UUID NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  label      TEXT NOT NULL
);

-- ── Notificações ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  task_id      UUID        REFERENCES public.tasks(id) ON DELETE SET NULL,
  from_user_id UUID        REFERENCES auth.users(id),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Mural ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mural_channels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  is_default BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mural_posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID        NOT NULL REFERENCES public.mural_channels(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Dependências entre tarefas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id            UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type    TEXT NOT NULL CHECK (dependency_type IN ('prerequisite', 'subsequent')),
  PRIMARY KEY (task_id, depends_on_task_id, dependency_type)
);

-- ════════════════════════════════════════════════════════════════════
--  ALTER TABLE tasks — novos campos v2
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_urgent          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status             TEXT        NOT NULL DEFAULT 'open'
                                               CHECK (status IN ('open','in_progress','delivered','archived')),
  ADD COLUMN IF NOT EXISTS type_id            UUID        REFERENCES public.task_types(id),
  ADD COLUMN IF NOT EXISTS requesting_area_id UUID        REFERENCES public.areas(id),
  ADD COLUMN IF NOT EXISTS requested_area_id  UUID        REFERENCES public.areas(id),
  ADD COLUMN IF NOT EXISTS desired_start_date DATE,
  ADD COLUMN IF NOT EXISTS start_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_minutes        INTEGER,
  ADD COLUMN IF NOT EXISTS parent_task_id     UUID        REFERENCES public.tasks(id),
  ADD COLUMN IF NOT EXISTS recurrence_config  JSONB,
  ADD COLUMN IF NOT EXISTS priority_number    INTEGER;

-- ── ALTER TABLE columns — novos campos v2 ─────────────────────────
ALTER TABLE public.columns
  ADD COLUMN IF NOT EXISTS estimated_effort_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS is_minimized               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notifications_enabled      BOOLEAN NOT NULL DEFAULT FALSE;

-- ════════════════════════════════════════════════════════════════════
--  ÍNDICES DE PERFORMANCE
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_task_assignees_task   ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user   ON public.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task     ON public.time_entries(task_id, started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_user     ON public.time_entries(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_values_task    ON public.task_custom_field_values(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent          ON public.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_type            ON public.tasks(type_id) WHERE type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status          ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_mural_posts_channel   ON public.mural_posts(channel_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════
--  RLS — novas tabelas
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.task_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_timers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies      ENABLE ROW LEVEL SECURITY;

-- Task types
CREATE POLICY "task_types_all" ON public.task_types
  FOR ALL USING (org_id = ANY(public.get_user_orgs()));

-- Areas
CREATE POLICY "areas_all" ON public.areas
  FOR ALL USING (org_id = ANY(public.get_user_orgs()));

-- Task assignees
CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "task_assignees_update" ON public.task_assignees
  FOR UPDATE USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- Time entries
CREATE POLICY "time_entries_select" ON public.time_entries
  FOR SELECT USING (user_id = auth.uid() OR
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "time_entries_insert" ON public.time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "time_entries_update_own" ON public.time_entries
  FOR UPDATE USING (user_id = auth.uid());

-- Active timers
CREATE POLICY "active_timers_own" ON public.active_timers
  FOR ALL USING (user_id = auth.uid());

-- Saved filters
CREATE POLICY "saved_filters_own" ON public.saved_filters
  FOR ALL USING (user_id = auth.uid());

-- Custom fields
CREATE POLICY "custom_fields_select" ON public.custom_fields
  FOR SELECT USING (
    board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "custom_fields_admin" ON public.custom_fields
  FOR ALL USING (
    board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs()))
    AND public.is_org_admin(
      (SELECT org_id FROM public.projects WHERE id = board_id LIMIT 1)
    )
  );

-- Custom field values
CREATE POLICY "custom_values_all" ON public.task_custom_field_values
  FOR ALL USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- Automations
CREATE POLICY "automations_select" ON public.automations
  FOR SELECT USING (
    board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs()))
  );
CREATE POLICY "automations_admin" ON public.automations
  FOR INSERT WITH CHECK (
    board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs()))
  );

-- Stage requirements
CREATE POLICY "stage_req_select" ON public.stage_requirements
  FOR SELECT USING (
    column_id IN (
      SELECT c.id FROM public.columns c
      JOIN public.projects p ON p.id = c.project_id
      WHERE p.org_id = ANY(public.get_user_orgs())
    )
  );

-- Notifications
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- Mural channels
CREATE POLICY "mural_channels_select" ON public.mural_channels
  FOR SELECT USING (org_id = ANY(public.get_user_orgs()));

-- Mural posts
CREATE POLICY "mural_posts_select" ON public.mural_posts
  FOR SELECT USING (
    channel_id IN (
      SELECT id FROM public.mural_channels WHERE org_id = ANY(public.get_user_orgs())
    )
  );
CREATE POLICY "mural_posts_insert" ON public.mural_posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Task dependencies
CREATE POLICY "task_deps_all" ON public.task_dependencies
  FOR ALL USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- ════════════════════════════════════════════════════════════════════
--  REALTIME — novas tabelas
-- ════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mural_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_timers;

-- ════════════════════════════════════════════════════════════════════
--  SEED — tipos de tarefa padrão e canal mural
-- ════════════════════════════════════════════════════════════════════
INSERT INTO public.task_types (org_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Tarefa', '#407EC9'),
  ('00000000-0000-0000-0000-000000000001', 'Bug', '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Feature', '#01CFB5'),
  ('00000000-0000-0000-0000-000000000001', 'Revisão', '#FFB81C'),
  ('00000000-0000-0000-0000-000000000001', 'Design', '#3B3FB6')
ON CONFLICT DO NOTHING;

INSERT INTO public.areas (org_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Produto'),
  ('00000000-0000-0000-0000-000000000001', 'Tecnologia'),
  ('00000000-0000-0000-0000-000000000001', 'Marketing'),
  ('00000000-0000-0000-0000-000000000001', 'Operações'),
  ('00000000-0000-0000-0000-000000000001', 'Conteúdo')
ON CONFLICT DO NOTHING;

INSERT INTO public.mural_channels (org_id, name, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Toda a empresa', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Performance', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Produto', FALSE)
ON CONFLICT DO NOTHING;
