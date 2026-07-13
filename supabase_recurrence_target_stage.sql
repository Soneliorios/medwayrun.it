-- Recorrência: permite escolher em QUAL etapa (coluna) a ocorrência recorrente é
-- criada, via recurrence_config.target_column_id. Se não houver (ou a coluna não
-- existir mais no quadro), cai na primeira coluna do quadro (comportamento antigo).
-- Mantém o filtro deleted_at (não gera de templates na Lixeira) e o created_by.
-- Idempotente (CREATE OR REPLACE).

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

    -- Etapa configurada (se ainda existe no quadro); senão, a primeira coluna.
    target_col := null;
    select id into target_col from public.columns
      where project_id = t.project_id
        and id = nullif(t.recurrence_config->>'target_column_id', '')::uuid;
    if target_col is null then
      select id into target_col from public.columns
        where project_id = t.project_id order by position limit 1;
    end if;

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
