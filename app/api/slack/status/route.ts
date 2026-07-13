import { NextResponse } from "next/server";

/**
 * Diagnóstico inócuo (autenticado, como o resto do app): informa apenas se o
 * SLACK_BOT_TOKEN está presente no deploy atual (booleano). Não expõe o token
 * nem envia nada. Serve para conferir, logado, se a produção enxerga o token.
 * O envio de fato continua só no POST autenticado de /api/slack/notify.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.SLACK_BOT_TOKEN,
    build: "status-v1",
  });
}
