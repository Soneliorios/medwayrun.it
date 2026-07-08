-- A tabela public.automations tinha apenas políticas de SELECT e INSERT (RLS
-- ligado). Sem políticas de UPDATE/DELETE, o RLS bloqueava silenciosamente:
--   - o contador execution_count do motor de automações;
--   - ativar/pausar, renomear e excluir automações pela página (a UI otimista
--     mostrava a mudança, mas o banco não gravava e revertia no reload).
-- Adicionamos as políticas org-scoped equivalentes às de select/insert.
drop policy if exists "automations_update" on public.automations;
create policy "automations_update" on public.automations
  for update
  using (board_id in (select id from public.projects where org_id = any(public.get_user_orgs())))
  with check (board_id in (select id from public.projects where org_id = any(public.get_user_orgs())));

drop policy if exists "automations_delete" on public.automations;
create policy "automations_delete" on public.automations
  for delete
  using (board_id in (select id from public.projects where org_id = any(public.get_user_orgs())));
