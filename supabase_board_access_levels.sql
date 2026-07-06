-- ════════════════════════════════════════════════════════════════════════════
-- Níveis de acesso do quadro privado + opção "Todos"
-- Rodar no Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- Flags "Todos os membros da org" por nível (evita ter que adicionar cada pessoa)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS access_all_view   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS access_all_create BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS access_all_edit   BOOLEAN NOT NULL DEFAULT FALSE;

-- project_members.role já mapeia os níveis:
--   'admin'  = Editar (mexer nas tasks, criar, ver)
--   'member' = Criar (criar tasks, ver)
--   'viewer' = Ver (somente visualizar)
