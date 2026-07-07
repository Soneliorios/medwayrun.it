-- ════════════════════════════════════════════════════════════════════════════
-- Anexos: permitir excluir o objeto no Storage (só havia INSERT + SELECT)
-- Sem isso, apagar um anexo remove a linha no banco mas deixa o arquivo órfão
-- no bucket task-files. Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "task_files_delete" ON storage.objects;
CREATE POLICY "task_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'task-files');
