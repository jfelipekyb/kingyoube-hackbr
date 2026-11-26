import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { recordEmailEvent } from "@/services/notificacao";
import { verifySvix } from "@/services/notificacao/svix";

export const dynamic = "force-dynamic";

/** Eventos da Resend. Sem assinatura Svix válida: 401. Nunca loga o corpo. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySvix(process.env.RESEND_WEBHOOK_SECRET, request.headers, raw)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  try {
    const result = await recordEmailEvent(getDb(), raw);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
}
