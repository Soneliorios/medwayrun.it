-- ════════════════════════════════════════════════════════════════════
--  MedwayRun — Seed
--  Execute AFTER the migration. Creates the Medway org and default labels.
--  Then create your first admin user via Supabase Auth → Users → "Add user".
-- ════════════════════════════════════════════════════════════════════

-- Organização Medway (ID fixo para referenciar no .env)
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Medway', 'medway')
ON CONFLICT (id) DO NOTHING;

-- Labels padrão
INSERT INTO public.labels (org_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Bug', '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Feature', '#407EC9'),
  ('00000000-0000-0000-0000-000000000001', 'Design', '#3B3FB6'),
  ('00000000-0000-0000-0000-000000000001', 'Documentação', '#52575C'),
  ('00000000-0000-0000-0000-000000000001', 'Urgente', '#AC145A'),
  ('00000000-0000-0000-0000-000000000001', 'Revisão', '#FFB81C')
ON CONFLICT DO NOTHING;

-- ── Como adicionar o primeiro admin após criar o usuário no Supabase Auth ──
-- Substitua '<USER_UUID>' pelo UUID do usuário criado no painel.
--
-- INSERT INTO public.members (org_id, user_id, role)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   '<USER_UUID>',
--   'owner'
-- );
