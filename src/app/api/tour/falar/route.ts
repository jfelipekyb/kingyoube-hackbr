import { NextResponse } from "next/server";
import { TOUR_STEPS } from "@/components/shell/tour-steps";
import { getDb } from "@/db/client";
import { synthesize } from "@/services/kim/voz";
import { readJson } from "../../receita/http";
import { limitKim, voiceErrorResponse } from "../../kim/http";

export const dynamic = "force-dynamic";

/**
 * Narração do tour pela voz da Kim: `passo` (1 a 8) → áudio da frase fixa daquele passo.
 * Só sintetiza os textos do tour, nunca texto livre; a mesma frase sai do cache de áudio.
 * Sem chave da ElevenLabs: `vozLigada: false`, e o tour segue em texto.
 */
export async function POST(request: Request) {
  const limited = await limitKim(request, "tour.falar");
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const passo = body.passo;
  if (typeof passo !== "number" || !Number.isInteger(passo) || passo < 1 || passo > TOUR_STEPS.length) {
    return NextResponse.json({ erro: `informe o passo, de 1 a ${TOUR_STEPS.length}` }, { status: 400 });
  }
  try {
    const speech = await synthesize({ db: getDb() }, TOUR_STEPS[passo - 1].text);
    if (!speech) return NextResponse.json({ vozLigada: false, aviso: "voz desligada" });
    return NextResponse.json({ vozLigada: true, audio: speech.audioBase64, mime: speech.mime, cache: speech.cached });
  } catch (e) {
    return voiceErrorResponse(e);
  }
}
