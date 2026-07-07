-- ════════════════════════════════════════════════════════════════════════════
-- Aprovações: notificações entre usuários + histórico das solicitações
-- Idempotente e não-destrutivo. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. NOTIFICAÇÕES para outros membros da org ──────────────────────────────
-- A policy padrão "notifications_own" (user_id = auth.uid()) impede criar uma
-- notificação para OUTRA pessoa (o aprovador / solicitante). Adiciona um INSERT
-- que permite notificar qualquer membro da mesma organização. As policies
-- permissivas são combinadas por OR, então "notifications_own" continua valendo
-- para SELECT/UPDATE/DELETE (cada um só mexe nas próprias).
DROP POLICY IF EXISTS notifications_insert_org ON public.notifications;
CREATE POLICY notifications_insert_org ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT m.user_id FROM public.members m
      WHERE m.org_id IN (
        SELECT m2.org_id FROM public.members m2 WHERE m2.user_id = auth.uid()
      )
    )
  );

-- ── 2. HISTÓRICO: permitir o cliente registrar eventos de aprovação ─────────
-- task_activity só tinha policy de SELECT; o trigger de tasks insere por ser
-- SECURITY DEFINER, mas o app precisa inserir eventos de aprovação diretamente.
DROP POLICY IF EXISTS task_activity_org_insert ON public.task_activity;
CREATE POLICY task_activity_org_insert ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT m.org_id FROM public.members m WHERE m.user_id = auth.uid())
  );
