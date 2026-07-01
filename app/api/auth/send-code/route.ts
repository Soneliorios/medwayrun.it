import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, code } = body as { email?: string; code?: string };

  if (!email || !email.toLowerCase().endsWith("@medway.com.br")) {
    return NextResponse.json(
      { error: "Apenas emails @medway.com.br são permitidos." },
      { status: 400 }
    );
  }

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // No email service configured — caller will show the code in the UI
    return NextResponse.json({ ok: true, emailSent: false });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MedwayRun <noreply@medwayrun.it>",
        to: email,
        subject: "Seu código de acesso — MedwayRun",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <div style="font-size:22px;font-weight:700;color:#00205B;margin-bottom:8px">MedwayRun</div>
            <p style="color:#444;margin-bottom:24px">
              Use o código abaixo para confirmar seu email e criar sua conta.
              Ele expira em <strong>10 minutos</strong>.
            </p>
            <div style="background:#f4f7ff;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
              <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#00205B">${code}</span>
            </div>
            <p style="color:#888;font-size:13px">
              Se você não solicitou este código, ignore este email.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-code] Resend error:", err);
      return NextResponse.json({ ok: true, emailSent: false });
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[send-code] fetch error:", err);
    return NextResponse.json({ ok: true, emailSent: false });
  }
}
