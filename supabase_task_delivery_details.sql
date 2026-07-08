-- Ajuste #6: quadro "Tarefa entregue".
-- Guarda o resumo da entrega no nível da tarefa (link do material e o que foi
-- entregue). A data (delivery_date) e o tempo total (tracked_hours) já existem.
-- Os dados por-responsável continuam em task_sequences (hours_spent,
-- delivery_note, delivery_link, delivered_at).
alter table public.tasks add column if not exists delivery_link text;
alter table public.tasks add column if not exists delivery_note text;
