-- Entrega "estacionada" aguardando aprovação.
--
-- Fluxo: se o responsável solicita aprovação e depois entrega, a entrega NÃO é
-- concretizada na hora — ela fica anexada à aprovação pendente. Quando o
-- aprovador APROVAR, a entrega é concretizada (avança a fila de responsáveis ou,
-- se for o único/último, move a task para "Concluído"). Se REJEITAR ou pedir
-- AJUSTE, a entrega estacionada é cancelada (o app limpa deliver_on_approve) e o
-- responsável precisa refazer e solicitar aprovação de novo.
--
-- deliver_payload guarda o que seria entregue: { mode, hours, note, link }.
-- Idempotente: pode rodar múltiplas vezes.

alter table public.task_approvals
  add column if not exists deliver_on_approve boolean not null default false;

alter table public.task_approvals
  add column if not exists deliver_payload jsonb;
