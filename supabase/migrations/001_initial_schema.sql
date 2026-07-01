-- ════════════════════════════════════════════════════════════════════
--  MedwayRun — Initial Schema
--  Execute this entire file in Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations (único — Medway interna) ────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        UNIQUE NOT NULL,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Profiles (espelho de auth.users com dados extras) ─────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Members (users por org com roles) ─────────────────────────────
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

-- ── Columns (kanban columns) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.columns (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  color          TEXT,
  is_done_column BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  column_id        UUID         NOT NULL REFERENCES public.columns(id) ON DELETE CASCADE,
  org_id           UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title            TEXT         NOT NULL,
  description      TEXT,
  priority         TEXT         NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  position         FLOAT8       NOT NULL DEFAULT 0,
  assignee_id      UUID         REFERENCES auth.users(id),
  due_date         DATE,
  estimated_hours  NUMERIC(5,2),
  tracked_hours    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by       UUID         REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

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

-- ════════════════════════════════════════════════════════════════════
--  ÍNDICES DE PERFORMANCE
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tasks_column_position  ON public.tasks(column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id       ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id      ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date         ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_columns_project        ON public.columns(project_id, position);
CREATE INDEX IF NOT EXISTS idx_members_user           ON public.members(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_task          ON public.comments(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_task        ON public.task_activities(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org           ON public.projects(org_id) WHERE is_archived = FALSE;

-- ════════════════════════════════════════════════════════════════════
--  TRIGGERS — updated_at automático
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.columns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations      ENABLE ROW LEVEL SECURITY;

-- Helper: returns org_ids the current user belongs to
CREATE OR REPLACE FUNCTION public.get_user_orgs()
RETURNS UUID[] LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT ARRAY(SELECT org_id FROM public.members WHERE user_id = auth.uid())
$$;

-- Helper: check if user is admin/owner of org
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner', 'admin')
  )
$$;

-- ── Organizations ─────────────────────────────────────────────────
CREATE POLICY "org_select" ON public.organizations
  FOR SELECT USING (id = ANY(public.get_user_orgs()));

-- ── Profiles ──────────────────────────────────────────────────────
CREATE POLICY "profile_own_select" ON public.profiles
  FOR SELECT USING (TRUE); -- all members can see all profiles in org

CREATE POLICY "profile_own_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- ── Members ───────────────────────────────────────────────────────
CREATE POLICY "members_select" ON public.members
  FOR SELECT USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "members_insert_admin" ON public.members
  FOR INSERT WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "members_update_admin" ON public.members
  FOR UPDATE USING (public.is_org_admin(org_id));

CREATE POLICY "members_delete_admin" ON public.members
  FOR DELETE USING (public.is_org_admin(org_id));

-- ── Projects ──────────────────────────────────────────────────────
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE USING (public.is_org_admin(org_id));

-- ── Columns ───────────────────────────────────────────────────────
CREATE POLICY "columns_select" ON public.columns
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())
    )
  );

CREATE POLICY "columns_all" ON public.columns
  FOR ALL USING (
    project_id IN (
      SELECT id FROM public.projects WHERE org_id = ANY(public.get_user_orgs())
    )
  );

-- ── Tasks ─────────────────────────────────────────────────────────
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (org_id = ANY(public.get_user_orgs()));

-- ── Labels ────────────────────────────────────────────────────────
CREATE POLICY "labels_all" ON public.labels
  FOR ALL USING (org_id = ANY(public.get_user_orgs()));

CREATE POLICY "task_labels_all" ON public.task_labels
  FOR ALL USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- ── Comments ──────────────────────────────────────────────────────
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (user_id = auth.uid());

-- ── Checklist Items ───────────────────────────────────────────────
CREATE POLICY "checklist_all" ON public.checklist_items
  FOR ALL USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- ── Task Activities ───────────────────────────────────────────────
CREATE POLICY "activities_select" ON public.task_activities
  FOR SELECT USING (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

CREATE POLICY "activities_insert" ON public.task_activities
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM public.tasks WHERE org_id = ANY(public.get_user_orgs()))
  );

-- ── Invitations ───────────────────────────────────────────────────
CREATE POLICY "invitations_select_admin" ON public.invitations
  FOR SELECT USING (public.is_org_admin(org_id));

CREATE POLICY "invitations_insert_admin" ON public.invitations
  FOR INSERT WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "invitations_delete_admin" ON public.invitations
  FOR DELETE USING (public.is_org_admin(org_id));

-- Token lookup for invite page (public, no auth required)
CREATE POLICY "invitations_token_lookup" ON public.invitations
  FOR SELECT USING (expires_at > NOW());

-- ════════════════════════════════════════════════════════════════════
--  REALTIME — enable for collaborative tables
-- ════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activities;
