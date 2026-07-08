-- Endurece o RLS para o gate de aprovação valer em TODAS as tabelas.
-- Antes, várias policies usavam USING(true) ou subquery em members SEM approved,
-- permitindo que uma conta "em análise" (approved=false) contornasse o gate.
-- Agora todas passam por get_user_orgs() (que só retorna orgs de membros
-- aprovados — ver supabase_member_approval.sql). Membros aprovados mantêm acesso
-- normal; não-aprovados (get_user_orgs vazio) ficam sem enxergar nada.

-- task_sequences (por tarefa)
drop policy if exists task_sequences_all on public.task_sequences;
create policy task_sequences_all on public.task_sequences for all to authenticated
  using (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())))
  with check (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())));

-- task_followers (por tarefa)
drop policy if exists task_followers_all on public.task_followers;
create policy task_followers_all on public.task_followers for all to authenticated
  using (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())))
  with check (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())));

-- task_attachments (tem org_id)
drop policy if exists task_attachments_all on public.task_attachments;
create policy task_attachments_all on public.task_attachments for all to authenticated
  using (org_id = any(public.get_user_orgs()))
  with check (org_id = any(public.get_user_orgs()));

-- task_labels (por tarefa)
drop policy if exists task_labels_all on public.task_labels;
create policy task_labels_all on public.task_labels for all to authenticated
  using (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())))
  with check (task_id in (select id from public.tasks where org_id = any(public.get_user_orgs())));

-- labels (org_id)
drop policy if exists labels_all on public.labels;
create policy labels_all on public.labels for all to authenticated
  using (org_id = any(public.get_user_orgs()))
  with check (org_id = any(public.get_user_orgs()));

-- project_members (por projeto)
drop policy if exists project_members_all on public.project_members;
create policy project_members_all on public.project_members for all to authenticated
  using (project_id in (select id from public.projects where org_id = any(public.get_user_orgs())))
  with check (project_id in (select id from public.projects where org_id = any(public.get_user_orgs())));

-- task_approvals (org_id) — antes: subquery members sem approved
drop policy if exists task_approvals_all on public.task_approvals;
create policy task_approvals_all on public.task_approvals for all to authenticated
  using (org_id = any(public.get_user_orgs()))
  with check (org_id = any(public.get_user_orgs()));

-- teams (org_id)
drop policy if exists teams_all on public.teams;
create policy teams_all on public.teams for all to authenticated
  using (org_id = any(public.get_user_orgs()))
  with check (org_id = any(public.get_user_orgs()));

-- task_activity (org_id) — leitura + inserção direta
drop policy if exists task_activity_org_read on public.task_activity;
create policy task_activity_org_read on public.task_activity for select to authenticated
  using (org_id = any(public.get_user_orgs()));
drop policy if exists task_activity_org_insert on public.task_activity;
create policy task_activity_org_insert on public.task_activity for insert to authenticated
  with check (org_id = any(public.get_user_orgs()));

-- notifications: só aprovados podem notificar co-membros
drop policy if exists notifications_insert_org on public.notifications;
create policy notifications_insert_org on public.notifications for insert to authenticated
  with check (user_id in (select user_id from public.members where org_id = any(public.get_user_orgs())));

-- profiles: parar de expor todos os perfis; ver só a si mesmo + co-membros das
-- orgs aprovadas (cobre os dois nomes possíveis da policy antiga).
drop policy if exists profile_own_select on public.profiles;
drop policy if exists profile_select on public.profiles;
drop policy if exists profiles_select_org on public.profiles;
create policy profiles_select_org on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or id in (select user_id from public.members where org_id = any(public.get_user_orgs()))
  );

-- is_org_admin() também exige approved (coerência: "em análise" zera privilégios)
create or replace function public.is_org_admin(p_org_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid()
      and org_id = p_org_id
      and approved = true
      and role in ('owner', 'admin')
  )
$$;
