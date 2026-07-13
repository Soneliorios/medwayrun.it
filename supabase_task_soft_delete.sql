-- Soft delete de tarefas.
-- Em vez de apagar fisicamente, marca tasks.deleted_at. A task some de todas as
-- listas mas fica recuperável na "Lixeira" do quadro por 7 dias. Após 7 dias é
-- apagada de vez (função de limpeza + pg_cron). Idempotente.

alter table public.tasks
  add column if not exists deleted_at timestamptz;

create index if not exists idx_tasks_deleted_at
  on public.tasks (deleted_at) where deleted_at is not null;

-- Limpeza: apaga DEFINITIVAMENTE tarefas na lixeira há mais de 7 dias.
create or replace function public.purge_deleted_tasks() returns void
language sql security definer as $$
  delete from public.tasks
  where deleted_at is not null and deleted_at < now() - interval '7 days';
$$;

-- Agenda diária via pg_cron (só se a extensão existir e o job ainda não existir).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge_deleted_tasks_daily') then
      perform cron.schedule('purge_deleted_tasks_daily', '0 4 * * *', 'select public.purge_deleted_tasks()');
    end if;
  end if;
end $$;

-- Não gerar recorrências a partir de templates que estão na Lixeira (deleted_at).
-- Recria generate_recurring_tasks apenas adicionando "AND deleted_at IS NULL".
create or replace function public.generate_recurring_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t          record;
  freq       text;
  next_run   date;
  until_date date;
  target_col uuid;
  new_next   date;
begin
  for t in
    select * from public.tasks
    where recurrence_config is not null
      and (recurrence_config->>'active')::boolean is true
      and (recurrence_config->>'next_run') is not null
      and (recurrence_config->>'next_run')::date <= current_date
      and deleted_at is null
  loop
    freq       := t.recurrence_config->>'frequency';
    next_run   := (t.recurrence_config->>'next_run')::date;
    until_date := nullif(t.recurrence_config->>'until', '')::date;

    if until_date is not null and until_date < current_date then
      update public.tasks
      set recurrence_config = jsonb_set(recurrence_config, '{active}', 'false')
      where id = t.id;
      continue;
    end if;

    select id into target_col from public.columns
      where project_id = t.project_id order by position limit 1;

    if target_col is not null then
      insert into public.tasks (
        project_id, column_id, org_id, title, description, priority, position,
        assignee_id, type_id, task_type, estimated_hours, is_urgent, status,
        requesting_area_id, board_subproject_id, created_by, recurrence_config
      ) values (
        t.project_id, target_col, t.org_id, t.title, t.description, t.priority,
        (extract(epoch from now())::bigint % 100000),
        t.assignee_id, t.type_id, t.task_type, t.estimated_hours, t.is_urgent, 'open',
        t.requesting_area_id, t.board_subproject_id, t.created_by, null
      );
    end if;

    new_next := case freq
      when 'daily'    then next_run + interval '1 day'
      when 'weekly'   then next_run + interval '7 days'
      when 'biweekly' then next_run + interval '14 days'
      when 'monthly'  then next_run + interval '1 month'
      else next_run + interval '7 days'
    end;

    if until_date is not null and new_next > until_date then
      update public.tasks
      set recurrence_config = jsonb_set(recurrence_config, '{active}', 'false')
      where id = t.id;
    else
      update public.tasks
      set recurrence_config = jsonb_set(recurrence_config, '{next_run}', to_jsonb(new_next::text))
      where id = t.id;
    end if;
  end loop;
end;
$$;
