import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { synthesize } from "@/services/kim/voz";
import { readJson } from "../../receita/http";
import { limitKim, voiceErrorResponse } from "../http";

export const dynamic = "force-dynamic";

/** `fala` → áudio da Kim + tempos de cada caractere (boca e legenda). Sem chave: `vozLigada: false`, sem erro. */
export async function POST(request: Request) {
  const limited = await limitKim(request, "kim.falar");
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const texto = typeof body.texto === "string" ? body.texto : "";
  try {
    const speech = await synthesize({ db: getDb() }, texto);
    if (!speech) return NextResponse.json({ vozLigada: false, aviso: "voz desligada" });
    return NextResponse.json({ vozLigada: true, audio: speech.audioBase64, mime: speech.mime, alinhamento: speech.alignment, cache: speech.cached, modelo: speech.model });
  } catch (e) {
    return voiceErrorResponse(e);
  }
}
