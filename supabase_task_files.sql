-- ════════════════════════════════════════════════════════════════════════════
-- Upload de arquivos em formulários + anexos visíveis na task
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. BUCKET DE STORAGE (público para leitura/preview) ─────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Qualquer um pode enviar (formulário público é anônimo) e ler (preview)
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'task-files');

DROP POLICY IF EXISTS "task_files_read" ON storage.objects;
CREATE POLICY "task_files_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'task-files');

-- ── 2. ANEXOS DA TASK ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id     UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name       TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  mime       TEXT,
  size       BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments(task_id, created_at);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_attachments_all ON public.task_attachments;
CREATE POLICY task_attachments_all ON public.task_attachments FOR ALL TO authenticated
USING (true) WITH CHECK (true);
