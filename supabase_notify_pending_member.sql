-- ════════════════════════════════════════════════════════════════════════════
-- Notificação para SUPERADMINS (role = owner) quando um novo usuário fica
-- pendente de aprovação (members.approved = false, recém-criado).
-- Trigger AFTER INSERT em members → cria uma notificação por owner da mesma org.
-- SECURITY DEFINER: roda com privilégios do dono (ignora RLS p/ inserir a notif).
-- Idempotente e não-destrutivo. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_owners_pending_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  TEXT;
  v_owner RECORD;
BEGIN
  -- Só quando o membro entra PENDENTE (approved = false).
  IF NEW.approved IS DISTINCT FROM FALSE THEN
    RETURN NEW;
  END IF;

  -- A notificação é um SIDE-EFFECT: envolta em bloco próprio para que qualquer
  -- erro aqui NUNCA aborte o INSERT do membro (registro é o que importa).
  BEGIN
    -- Nome do novo usuário: profiles.full_name → email do auth → id.
    SELECT COALESCE(NULLIF(p.full_name, ''), u.email, NEW.user_id::text)
      INTO v_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = NEW.user_id;
    v_name := COALESCE(v_name, NEW.user_id::text);

    -- Uma notificação para cada OWNER (superadmin) da mesma org (menos o próprio).
    -- Dedup: pula owners que já têm uma notificação NÃO LIDA sobre este usuário
    -- (evita duplicar em re-inserção de membro, ex.: rejeitar → reconfirmar).
    FOR v_owner IN
      SELECT m.user_id
      FROM public.members m
      WHERE m.org_id = NEW.org_id
        AND m.role = 'owner'
        AND m.user_id <> NEW.user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = m.user_id
            AND n.type = 'user_pending'
            AND n.from_user_id = NEW.user_id
            AND n.read_at IS NULL
        )
    LOOP
      INSERT INTO public.notifications (user_id, type, content, from_user_id)
      VALUES (
        v_owner.user_id,
        'user_pending',
        'Novo usuário aguardando aprovação: ' || v_name,
        NEW.user_id
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_owners_pending_member falhou: %', SQLERRM; -- não aborta o INSERT
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_pending_member ON public.members;
CREATE TRIGGER trg_notify_owners_pending_member
  AFTER INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_owners_pending_member();
