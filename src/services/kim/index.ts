// Kim (docs/09): pergunta → resposta por regra, gravada em kim_queries e na auditoria. Nunca grava áudio.
import { kimQueries } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";
import { answerQuestion, type KimAnswer } from "./answers";

export type KimInputMode = (typeof kimQueries.$inferInsert)["inputMode"];
export const KIM_INPUT_MODES: readonly KimInputMode[] = ["voz", "botao", "texto"];

export async function askKim(db: Db, input: { text: string; mode: KimInputMode; actor: string }): Promise<KimAnswer & { queryId: string }> {
  const answer = await answerQuestion(db, input.text);
  const userId = /^usuario:([0-9a-f-]{36})$/i.exec(input.actor)?.[1] ?? null;
  const [row] = await db
    .insert(kimQueries)
    .values({ userId, inputMode: input.mode, recognizedText: input.text, intent: answer.intent, answerText: answer.legenda })
    .returning({ id: kimQueries.id });
  await recordAudit(db, { actor: input.actor, action: "kim.pergunta", entity: "kim_query", entityId: row.id, result: answer.intent, details: { modo: input.mode } });
  return { ...answer, queryId: row.id };
}
