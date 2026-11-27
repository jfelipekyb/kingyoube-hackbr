import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { clientIp, limitPerIp } from "@/services/demo";
import { VoiceError } from "@/services/kim/voz";

/** Limites por IP (janela de 1 min): a voz gasta crédito da ElevenLabs. */
export const KIM_LIMITS = { "kim.ouvir": 10, "kim.perguntar": 30, "kim.falar": 20 } as const;

export async function limitKim(request: Request, action: keyof typeof KIM_LIMITS): Promise<NextResponse | null> {
  const retry = await limitPerIp(getDb(), { action, ip: clientIp(request.headers), max: KIM_LIMITS[action] });
  if (retry === null) return null;
  return NextResponse.json({ erro: `Muitas perguntas seguidas. Tente de novo em ${retry} s.`, codigo: "LIMITE_KIM" }, { status: 429, headers: { "Retry-After": String(retry) } });
}

export function voiceErrorResponse(e: unknown): NextResponse {
  if (e instanceof VoiceError) return NextResponse.json({ erro: e.message, codigo: e.code }, { status: e.status });
  throw e;
}
