import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { answerQuestion } from "@/services/kim/answers";
import { voiceConfig } from "@/services/kim/voz";
import { readJson } from "../../receita/http";
import { limitKim } from "../http";

export const dynamic = "force-dynamic";

const MAX_QUESTION = 500;

/** Pergunta em texto → intenção por regra → `legenda` (números formatados) e `fala` (por extenso). Não muda nada na base. */
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
  const a = await answerQuestion(getDb(), texto);
  return NextResponse.json({ intencao: a.intent, legenda: a.legenda, fala: a.fala, vozLigada: voiceConfig() !== null });
}
