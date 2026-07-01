-- ════════════════════════════════════════════════════════════════════
--  MedwayRun — MIGRATION COMPLETA (001 + 002 + seed)
--  Cole e execute tudo de uma vez no Supabase > SQL Editor
-- ════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        UNIQUE NOT NULL,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Members ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID        REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- ── Projects ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  color       TEXT        NOT NULL DEFAULT '#00205B',
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  is_favorite BOOLEAN     NOT NULL DEFAULT FALSE,
  owner_id    UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Columns ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.columns (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name                        TEXT        NOT NULL,
  position                    INTEGER     NOT NULL DEFAULT 0,
  color                       TEXT,
  is_done_column              BOOLEAN     NOT NULL DEFAULT FALSE,
  estimated_effort_minutes    INTEGER,
  is_minimized                BOOLEAN     NOT NULL DEFAULT FALSE,
  notifications_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  column_id           UUID         NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  org_id              UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title               TEXT         NOT NULL,
  description         TEXT,
  priority            TEXT         NOT NULL DEFAULT 'medium'
                                   CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  position            FLOAT8       NOT NULL DEFAULT 0,
  assignee_id         UUID         REFERENCES auth.users(id),
  due_date            DATE,
  estimated_hours     NUMERIC(5,2),
  tracked_hours       NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_urgent           BOOLEAN      NOT NULL DEFAULT FALSE,
  status              TEXT         NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','in_progress','delivered','archived')),
  type_id             UUID,
  requesting_area_id  UUID,
  requested_area_id   UUID,
  desired_start_date  DATE,
  start_date          TIMESTAMPTZ,
  delivery_date       TIMESTAMPTZ,
  sla_minutes         INTEGER,
  parent_task_id      UUID         REFERENCES public.tasks(id),
  recurrence_config   JSONB,
  priority_number     INTEGER,
  created_by          UUID         REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Task types ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_types (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#407EC9'
);

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_type FOREIGN KEY (type_id) REFERENCES public.task_types(id);

-- ── Areas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name   TEXT NOT NULL
);

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_req_area FOREIGN KEY (requesting_area_id) REFERENCES public.areas(id),
  ADD CONSTRAINT fk_tasks_res_area FOREIGN KEY (requested_area_id)  REFERENCES public.areas(id);

-- ── Labels ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labels (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#01CFB5'
);

CREATE TABLE IF NOT EXISTS public.task_labels (
  task_id  UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- ── Comments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Checklist Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id  UUID    NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title    TEXT    NOT NULL,
  is_done  BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0
);

-- ── Task Activity Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_activities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES auth.users(id),
  action     TEXT        NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Invitations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'member',
  token      TEXT        UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  invited_by UUID        REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Task Assignees ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_order INTEGER     NOT NULL DEFAULT 0,
  delivered_at   TIMESTAMPTZ,
  UNIQUE (task_id, user_id)
);

-- ── Time Entries ──────────────────────────────────────────────────
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

-- ── Active Timers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.active_timers (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Saved Filters ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id     UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  filters_json JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Custom Fields ─────────────────────────────────────────────────
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

-- ── Automations ───────────────────────────────────────────────────
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

-- ── Stage Requirements ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stage_requirements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id  UUID NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  label      TEXT NOT NULL
);

-- ── Notifications ─────────────────────────────────────────────────
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

-- ── Task Dependencies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id            UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type    TEXT NOT NULL CHECK (dependency_type IN ('prerequisite', 'subsequent')),
  PRIMARY KEY (task_id, depends_on_task_id, dependency_type)
);

-- ════════════════════════════════════════════════════════════════════
--  ÍNDICES
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tasks_column_position  ON public.tasks(column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id       ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id      ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date         ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status           ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type             ON public.tasks(type_id) WHERE type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent           ON public.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_columns_project        ON public.columns(project_id, position);
CREATE INDEX IF NOT EXISTS idx_members_user           ON public.members(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_task          ON public.comments(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_task        ON public.task_activities(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org           ON public.projects(org_id) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_task_assignees_task    ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user    ON public.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task      ON public.time_entries(task_id, started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_user      ON public.time_entries(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_values_task     ON public.task_custom_field_values(task_id);
CREATE INDEX IF NOT EXISTS idx_mural_posts_channel    ON public.mural_posts(channel_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════
--  FUNÇÕES E TRIGGERS
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER tasks_updated_at    BEFORE UPDATE ON public.tasks    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile + auto-add to org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.members (org_id, user_id, role)
  VALUES ('00000000-0000-0000-0000-000000000001', NEW.id, 'member')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.columns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_timers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_requirements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies     ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_orgs()
RETURNS UUID[] LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT ARRAY(SELECT org_id FROM public.members WHERE user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid() AND org_id = p_org_id AND role IN ('owner', 'admin')
  )
$$;

-- Organizations
CREATE POLICY "org_select" ON public.organizations FOR SELECT USING (id = ANY(public.get_user_orgs()));

-- Profiles
CREATE POLICY "profile_select" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profile_update" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Members
CREATE POLICY "members_select"       ON public.members FOR SELECT USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "members_insert_admin" ON public.members FOR INSERT WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "members_update_admin" ON public.members FOR UPDATE USING (public.is_org_admin(org_id));
CREATE POLICY "members_delete_admin" ON public.members FOR DELETE USING (public.is_org_admin(org_id));

-- Projects
CREATE POLICY "projects_select"       ON public.projects FOR SELECT USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "projects_insert"       ON public.projects FOR INSERT WITH CHECK (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "projects_update"       ON public.projects FOR UPDATE USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "projects_delete_admin" ON public.projects FOR DELETE USING (public.is_org_admin(org_id));

-- Columns
CREATE POLICY "columns_all" ON public.columns FOR ALL USING (
  project_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs()))
);

-- Tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (org_id = ANY(public.get_user_orgs()));

-- Task types / areas
CREATE POLICY "task_types_all" ON public.task_types FOR ALL USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "areas_all"      ON public.areas      FOR ALL USING (org_id = ANY(public.get_user_orgs()));

-- Labels
CREATE POLICY "labels_all"      ON public.labels      FOR ALL USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "task_labels_all" ON public.task_labels FOR ALL USING (
  task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
);

-- Comments
CREATE POLICY "comments_select"     ON public.comments FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "comments_insert"     ON public.comments FOR INSERT WITH CHECK (user_id = auth.uid() AND task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE USING (user_id = auth.uid());

-- Checklist / activities
CREATE POLICY "checklist_all"   ON public.checklist_items  FOR ALL USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "activities_select" ON public.task_activities FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "activities_insert" ON public.task_activities FOR INSERT WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));

-- Invitations
CREATE POLICY "invitations_admin"        ON public.invitations FOR SELECT  USING (public.is_org_admin(org_id));
CREATE POLICY "invitations_insert_admin" ON public.invitations FOR INSERT  WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "invitations_delete_admin" ON public.invitations FOR DELETE  USING (public.is_org_admin(org_id));
CREATE POLICY "invitations_token_lookup" ON public.invitations FOR SELECT  USING (expires_at > NOW());

-- Task assignees
CREATE POLICY "task_assignees_select" ON public.task_assignees FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "task_assignees_insert" ON public.task_assignees FOR INSERT WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "task_assignees_update" ON public.task_assignees FOR UPDATE USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "task_assignees_delete" ON public.task_assignees FOR DELETE USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));

-- Time entries / timers
CREATE POLICY "time_entries_select"    ON public.time_entries  FOR SELECT USING (user_id = auth.uid() OR task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "time_entries_insert"    ON public.time_entries  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "time_entries_update"    ON public.time_entries  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "active_timers_own"      ON public.active_timers FOR ALL   USING (user_id = auth.uid());

-- Filters / custom fields
CREATE POLICY "saved_filters_own"    ON public.saved_filters            FOR ALL USING (user_id = auth.uid());
CREATE POLICY "custom_fields_select" ON public.custom_fields            FOR SELECT USING (board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "custom_fields_admin"  ON public.custom_fields            FOR ALL    USING (board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())) AND public.is_org_admin((SELECT org_id FROM public.projects WHERE id = board_id LIMIT 1)));
CREATE POLICY "custom_values_all"    ON public.task_custom_field_values FOR ALL    USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));

-- Automations / stage reqs
CREATE POLICY "automations_select" ON public.automations        FOR SELECT     USING (board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "automations_insert" ON public.automations        FOR INSERT     WITH CHECK (board_id IN (SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "stage_req_select"   ON public.stage_requirements FOR SELECT     USING (column_id IN (SELECT c.id FROM public.columns c JOIN public.projects p ON p.id = c.project_id WHERE p.org_id = ANY(public.get_user_orgs())));

-- Notifications
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- Mural
CREATE POLICY "mural_channels_select" ON public.mural_channels FOR SELECT USING (org_id = ANY(public.get_user_orgs()));
CREATE POLICY "mural_posts_select"    ON public.mural_posts    FOR SELECT USING (channel_id IN (SELECT id FROM public.mural_channels WHERE org_id = ANY(public.get_user_orgs())));
CREATE POLICY "mural_posts_insert"    ON public.mural_posts    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Task dependencies
CREATE POLICY "task_deps_all" ON public.task_dependencies FOR ALL USING (task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs())));

-- ════════════════════════════════════════════════════════════════════
--  REALTIME
-- ════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mural_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_timers;

-- ════════════════════════════════════════════════════════════════════
--  SEED
-- ════════════════════════════════════════════════════════════════════
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Medway', 'medway')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.labels (org_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Bug',          '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Feature',      '#407EC9'),
  ('00000000-0000-0000-0000-000000000001', 'Design',       '#3B3FB6'),
  ('00000000-0000-0000-0000-000000000001', 'Documentação', '#52575C'),
  ('00000000-0000-0000-0000-000000000001', 'Urgente',      '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Revisão',      '#FFB81C')
ON CONFLICT DO NOTHING;

INSERT INTO public.task_types (org_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Tarefa',  '#407EC9'),
  ('00000000-0000-0000-0000-000000000001', 'Bug',     '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Feature', '#01CFB5'),
  ('00000000-0000-0000-0000-000000000001', 'Revisão', '#FFB81C'),
  ('00000000-0000-0000-0000-000000000001', 'Design',  '#3B3FB6')
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
  ('00000000-0000-0000-0000-000000000001', 'Performance',    FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Produto',        FALSE)
ON CONFLICT DO NOTHING;
