// Resumo do dia da Kim para o contador pelo WhatsApp simulado (docs/11, seção 4). Números da base, pela regra.
import { and, desc, eq } from "drizzle-orm";
import { outboundMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { brasiliaDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { recordAudit } from "@/services/auditoria";
import { portfolioMetrics, portfolioTotals } from "@/services/carteira/metrics";
import { recordAgentEvent } from "@/services/equipe";
import { SIMULATED_STATUS, whatsappMode } from "@/services/notificacao";
import type { Env } from "@/lib/config";

export const SUMMARY_TO = "Contador (WhatsApp simulado)";

/** "3 decisões, R$ 1.236,50 travado" */
export function summaryLine(decisions: number, lockedCents: bigint): string {
  return `${decisions} ${decisions === 1 ? "decisão" : "decisões"}, ${formatBRL(lockedCents)} travado`;
}

/** Grava o resumo do dia em outbound_messages (idempotente por dia + conteúdo), com evento da Kim e auditoria. */
export async function sendDailySummary(db: Db, input: { now: Date; actor: string; env?: Env }) {
  if (whatsappMode(input.env ?? process.env) !== "SIMULADO") throw new Error("WhatsApp real (WHATSAPP_MODE=NVOIP) entra na S9; use WHATSAPP_MODE=SIMULADO");
  const t = portfolioTotals(await portfolioMetrics(db));
  const line = summaryLine(t.decisions, t.lockedCents);
  const day = brasiliaDay(input.now);
  const key = `kim-resumo-${day}-${line}`;
  const body = `Bom dia! Aqui é a Kim, da KingYouBe. Resumo de hoje: ${line}. As decisões esperam você na tela.`;
  const [row] = await db
    .insert(outboundMessages)
    .values({ channel: "whatsapp", kind: "resumo_kim", refId: day, toLabel: SUMMARY_TO, idempotencyKey: key, lastStatus: SIMULATED_STATUS, body })
    .onConflictDoNothing()
    .returning();
  if (!row) return { message: (await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, key)))[0], line, created: false };
  await recordAgentEvent(db, { agent: "kim", action: "resumo_whatsapp", entity: "outbound_message", entityId: row.id, status: "feito", summary: `Resumo do dia no WhatsApp simulado: ${line}`, count: 1, minutesSaved: 2 });
  await recordAudit(db, { actor: input.actor, action: "mensagem.whatsapp_resumo_kim", entity: "outbound_message", entityId: row.id, result: SIMULATED_STATUS, details: { canal: "whatsapp", modo: "SIMULADO", resumo: line } });
  return { message: row, line, created: true };
}

export async function latestSummary(db: Db) {
  const [row] = await db
    .select()
    .from(outboundMessages)
    .where(and(eq(outboundMessages.channel, "whatsapp"), eq(outboundMessages.kind, "resumo_kim")))
    .orderBy(desc(outboundMessages.createdAt))
    .limit(1);
  return row ?? null;
}
