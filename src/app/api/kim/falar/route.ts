import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { kimQueries } from "@/db/schema";
import { answerQuestion } from "@/services/kim/answers";
import { synthesize } from "@/services/kim/voz";
import { readJson } from "../../receita/http";
import { limitKim, voiceErrorResponse } from "../http";

export const dynamic = "force-dynamic";

const QUERY_TTL_MS = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fala da resposta de uma consulta recente (`consulta` = id de kim_queries) → áudio + tempos de cada caractere.
 * O texto falado é sempre o da Kim, recalculado pela regra: a rota não sintetiza texto qualquer.
 * Sem chave: `vozLigada: false`, sem erro.
 */
export async function POST(request: Request) {
  const limited = await limitKim(request, "kim.falar");
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const id = typeof body.consulta === "string" && UUID.test(body.consulta) ? body.consulta : null;
  if (!id) return NextResponse.json({ erro: "informe a consulta" }, { status: 400 });
  const db = getDb();
  const [q] = await db
    .select({ text: kimQueries.recognizedText })
    .from(kimQueries)
    .where(and(eq(kimQueries.id, id), gt(kimQueries.at, new Date(Date.now() - QUERY_TTL_MS))));
  if (!q?.text) return NextResponse.json({ erro: "consulta não encontrada ou expirada" }, { status: 404 });
  try {
    const speech = await synthesize({ db }, (await answerQuestion(db, q.text)).fala);
    if (!speech) return NextResponse.json({ vozLigada: false, aviso: "voz desligada" });
    return NextResponse.json({ vozLigada: true, audio: speech.audioBase64, mime: speech.mime, alinhamento: speech.alignment, cache: speech.cached, modelo: speech.model });
  } catch (e) {
    return voiceErrorResponse(e);
  }
}
