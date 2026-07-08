-- Ajuste #6 (raiz do bug do tempo): tasks.tracked_hours e tasks.estimated_hours
-- eram numeric(_,2) — só 2 casas decimais. Como o app guarda tempo em HORAS,
-- 1 minuto = 0,016667h era arredondado para 0,02h = 72s (1min12s) — exatamente
-- o "+12s" relatado. O arredondamento no JS não resolve porque o próprio banco
-- trunca no INSERT/UPDATE.
--
-- Alargamos a precisão para 6 casas decimais (resolução ~0,0036s), o que
-- preserva os segundos no ida-e-volta (formatHms arredonda para o segundo mais
-- próximo). task_sequences.hours_spent/part_start_hours já têm precisão total.
alter table public.tasks alter column tracked_hours type numeric(12,6);
alter table public.tasks alter column estimated_hours type numeric(12,6);
