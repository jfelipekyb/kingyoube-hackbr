import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { askKim, KIM_INPUT_MODES, type KimInputMode } from "@/services/kim";
import { voiceConfig } from "@/services/kim/voz";
import { readJson } from "../../receita/http";
import { limitKim } from "../http";

export const dynamic = "force-dynamic";

const MAX_QUESTION = 500;

/** Pergunta em texto → intenção por regra → `legenda` (números formatados) e `fala` (por extenso). Grava a consulta em kim_queries e na auditoria (sem áudio); não muda nenhuma proposta. */
export async function POST(request: Request) {
  const limited = await limitKim(request, "kim.perguntar");
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!texto || texto.length > MAX_QUESTION) return NextResponse.json({ erro: `pergunta de 1 a ${MAX_QUESTION} caracteres` }, { status: 400 });
  const mode = KIM_INPUT_MODES.includes(body.modo as KimInputMode) ? (body.modo as KimInputMode) : "texto";
  const a = await askKim(getDb(), { text: texto, mode, actor: actorFromRequest(request) });
  return NextResponse.json({ consulta: a.queryId, intencao: a.intent, legenda: a.legenda, fala: a.fala, vozLigada: voiceConfig() !== null });
}
