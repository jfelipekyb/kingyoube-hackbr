// Confirmação do RAD (docs/04): DARF gerado não é DARF pago. Só o recolhimento sincronizado da Receita confirma.
import { and, eq, inArray, sql } from "drizzle-orm";
import { radProposals, rfbPayments, rfbRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { demoToday } from "@/lib/clock";
import { brasiliaDay } from "@/lib/dates";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";

const RAD_TYPE = 1;
// Solicitação ainda não normalizada: o recolhimento pode estar no arquivo que falta.
const PENDING_REQUEST_STATES = ["solicitada", "em_processamento", "concluida", "baixada"] as const;

/**
 * darf_gerado + recolhimento com a mesma chave → pago_confirmado (R07 se o valor diferir).
 * Vencimento passado sem recolhimento → vencida, mas só quando todas as solicitações de recolhimentos do cliente já foram processadas.
 */
export async function confirmRadPayments(deps: { db: Db; env?: Record<string, string | undefined>; now?: () => Date }, companyId: string | null = null) {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const today = (env.RECEITA_MODE ?? "SIMULADO").toUpperCase() === "REAL" ? brasiliaDay((deps.now ?? (() => new Date()))()) : demoToday(env);
  const open = await db
    .select()
    .from(radProposals)
    .where(and(eq(radProposals.state, "darf_gerado"), companyId ? eq(radProposals.companyId, companyId) : undefined));
  if (open.length === 0) return { confirmed: 0, divergent: 0, expired: 0 };
  const paid = await db
    .select({ companyId: rfbPayments.companyId, accessKey: rfbPayments.accessKey, cents: sql<string>`sum(${rfbPayments.principalCents})::text` })
    .from(rfbPayments)
    .where(and(eq(rfbPayments.type, RAD_TYPE), inArray(rfbPayments.accessKey, open.map((p) => p.accessKey))))
    .groupBy(rfbPayments.companyId, rfbPayments.accessKey);
  const paidByKey = new Map(paid.map((p) => [`${p.companyId}|${p.accessKey}`, BigInt(p.cents)]));
  const pending = await db
    .selectDistinct({ companyId: rfbRequests.companyId })
    .from(rfbRequests)
    .where(
      and(
        eq(rfbRequests.service, "recolhimentos"),
        inArray(rfbRequests.state, [...PENDING_REQUEST_STATES]),
        inArray(rfbRequests.companyId, [...new Set(open.map((p) => p.companyId))]),
      ),
    );
  const awaitingRecolhimentos = new Set(pending.map((r) => r.companyId));
  const at = (deps.now ?? (() => new Date()))();
  let confirmed = 0;
  let divergent = 0;
  let expired = 0;
  for (const p of open) {
    const cents = paidByKey.get(`${p.companyId}|${p.accessKey}`);
    if (cents !== undefined) {
      const differs = p.principalCents !== null && cents !== p.principalCents;
      const [row] = await db
        .update(radProposals)
        .set({ state: "pago_confirmado", confirmedAt: at, paidPrincipalCents: cents, divergenceRule: differs ? "R07" : null })
        .where(and(eq(radProposals.id, p.id), eq(radProposals.state, "darf_gerado")))
        .returning();
      if (!row) continue;
      confirmed++;
      if (differs) divergent++;
      await recordAgentEvent(db, {
        agent: "tesouraria",
        action: "rad_confirmado",
        entity: "rad_proposal",
        entityId: p.id,
        status: differs ? "revisado_divergente" : "revisado_ok",
        summary: differs ? "Recolhimento do RAD encontrado na Receita com valor diferente do DARF (R07)" : "Pagamento do RAD confirmado pela consulta de recolhimentos",
        count: 1,
        minutesSaved: 5,
      });
      await recordAudit(db, {
        actor: "sistema:conciliacao",
        action: "rad.confirmar_pagamento",
        entity: "rad_proposal",
        entityId: p.id,
        result: differs ? "divergente_R07" : "ok",
        details: { recolhidoCents: cents.toString(), darfCents: p.principalCents?.toString() ?? null },
      });
    } else if (p.dueDate && p.dueDate < today && !awaitingRecolhimentos.has(p.companyId)) {
      const [row] = await db
        .update(radProposals)
        .set({ state: "vencida" })
        .where(and(eq(radProposals.id, p.id), eq(radProposals.state, "darf_gerado")))
        .returning();
      if (!row) continue;
      expired++;
      await recordAudit(db, { actor: "sistema:conciliacao", action: "rad.vencer", entity: "rad_proposal", entityId: p.id, result: "vencida", details: { vencimento: p.dueDate, hoje: today } });
    }
  }
  return { confirmed, divergent, expired };
}
