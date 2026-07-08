-- Aprovação de contas: qualquer email pode se cadastrar, mas o superadmin precisa
-- aprovar. Contas não aprovadas ficam sem acesso a NADA (gate no próprio RLS).
--
-- 1) Coluna approved em members. Novos membros nascem NÃO aprovados (default false).
alter table public.members add column if not exists approved boolean not null default false;

-- 2) Todos os membros JÁ existentes continuam com acesso (grandfather) — inclui o
--    superadmin/owner, para ninguém se trancar para fora.
update public.members set approved = true where approved is distinct from true;

-- 3) get_user_orgs() passa a considerar SÓ orgs de membros aprovados. Como quase
--    todo o RLS usa "org_id = ANY(get_user_orgs())", um membro não aprovado deixa
--    de enxergar/gravar qualquer coisa da org.
create or replace function public.get_user_orgs()
returns uuid[]
language sql
security definer
stable
as $$
  select array(
    select org_id from public.members
    where user_id = auth.uid() and approved = true
  )
$$;

-- 4) Mesmo sem aprovação, o usuário pode ler a PRÓPRIA linha de member — assim o
--    app sabe que a conta está "em análise" e mostra a mensagem certa. Não expõe
--    os demais membros (apenas a própria linha).
drop policy if exists "members_select_self" on public.members;
create policy "members_select_self" on public.members
  for select using (user_id = auth.uid());
