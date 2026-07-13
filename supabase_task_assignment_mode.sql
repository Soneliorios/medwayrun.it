-- Modo de responsáveis da task: 'sequential' (fila, um ativo por vez — padrão e
-- comportamento atual) ou 'parallel' (vários responsáveis ao mesmo tempo, entrega
-- única). Definido automaticamente pela lateral: 2+ responsáveis lá = 'parallel'.
-- Idempotente. Linhas existentes ficam 'sequential' (preserva o comportamento).

alter table public.tasks
  add column if not exists assignment_mode text not null default 'sequential';
