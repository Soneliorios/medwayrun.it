import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";
const DEFAULT_FROM = "MedwayFlow <naoresponda@medwayflow.app>";

/**
 * Envia e-mails via Resend (API) para uma lista de usuários (por user_id do app).
 * Resolve o e-mail de cada um (service role) e dispara pelo Resend.
 *
 * Requer:
 *  - RESEND_API_KEY (env, secreta) — API key do Resend.
 *  - RESEND_FROM (env, opcional) — remetente no domínio verificado. Ex.:
 *    "MedwayFlow <naoresponda@medwayflow.app>". Sem ela, usa o default acima
 *    (que só funciona se medwayflow.app estiver verificado no Resend).
 */

// Diagnóstico leve (autenticado): confirma se a key está no ambiente e o remetente.
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM ?? DEFAULT_FROM,
  });
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "not_configured" });
  const from = process.env.RESEND_FROM ?? DEFAULT_FROM;

  let payload: { userIds?: string[]; subject?: string; html?: string; text?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  const userIds = [...new Set((payload.userIds ?? []).filter(Boolean))];
  const subject = (payload.subject ?? "MedwayFlow").toString().slice(0, 300);
  const html = (payload.html ?? "").toString();
  const text = (payload.text ?? "").toString();
  if (!userIds.length || (!html && !text)) return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });

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
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ from, to: [email], subject, html: html || undefined, text: text || undefined }),
      });
      if (res.ok) sent++;
      else { failed.push(email); console.error("[email/send] resend", res.status, await res.text().catch(() => "")); }
    } catch (e) {
      console.error("[email/send]", e);
      failed.push(uid);
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
