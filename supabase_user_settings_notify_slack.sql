-- ════════════════════════════════════════════════════════════════════════════
-- Preferência por usuário: espelhar as notificações do app no Slack (DM).
-- Off por padrão; o usuário liga no portal de notificações (sino). A rota
-- /api/slack/notify (respectPref) só envia pra quem tem isto = true.
-- Idempotente. Rodar no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notify_slack BOOLEAN NOT NULL DEFAULT false;
