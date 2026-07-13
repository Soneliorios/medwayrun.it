import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

/**
 * Envia DMs no Slack para uma lista de usuários (por user_id do app).
 * Resolve o e-mail de cada usuário (service role), acha o usuário no Slack via
 * users.lookupByEmail, abre o DM (conversations.open) e posta (chat.postMessage).
 *
 * Requer SLACK_BOT_TOKEN (env, secreta) — bot token de um app do Slack com os
 * escopos `chat:write` e `users:read.email`. Sem o token, responde
 * { ok:false, error:"not_configured" } sem quebrar a automação.
 */
async function slack(method: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

// Diagnóstico leve: confirma se o SLACK_BOT_TOKEN está disponível em produção
// (sem expor o token). Não requer auth — retorna só um booleano.
export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.SLACK_BOT_TOKEN });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "not_configured" });

  let payload: { userIds?: string[]; text?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  const userIds = [...new Set((payload.userIds ?? []).filter(Boolean))];
  const text = (payload.text ?? "").toString().slice(0, 3000);
  if (!userIds.length || !text) return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Caller precisa ser membro aprovado da org.
  const { data: caller } = await admin
    .from("members").select("user_id, approved").eq("org_id", ORG_ID).eq("user_id", user.id).maybeSingle();
  if (!caller || (caller as { approved?: boolean }).approved === false) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let sent = 0;
  const failed: string[] = [];
  for (const uid of userIds) {
    try {
      const { data: got } = await admin.auth.admin.getUserById(uid);
      const email = got?.user?.email;
      if (!email) { failed.push(uid); continue; }
      const lookup = await slack("users.lookupByEmail", token, { email });
      const slackUserId = lookup?.user?.id;
      if (!lookup?.ok || !slackUserId) { failed.push(email); continue; }
      // Posta direto no user id — o Slack abre o DM. (conversations.open exigiria
      // o scope im:write; chat.postMessage no U… funciona só com chat:write.)
      const posted = await slack("chat.postMessage", token, { channel: slackUserId, text });
      if (posted?.ok) sent++; else failed.push(email);
    } catch {
      failed.push(uid);
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
