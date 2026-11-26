// Candidatas a RAD e indicadores da carteira (docs/04), calculados só a partir da base.
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, invoices, radProposals, reconciliationItems, rfbCredits, rfbPayments } from "@/db/schema";
import type { Db } from "@/db/types";

const RAD_TYPE = 1;
// pago_confirmado não conta: se sobrou saldo travado (RAD parcial), ele ainda espera decisão.
const DECIDED_STATES = ["aprovada", "darf_gerado"] as const;

export interface RadCandidate {
  companyId: string;
  invoiceId: string;
  accessKey: string;
  period: string;
  counterpartyCnpj: string;
  aApropriarCents: bigint;
  confirmedRadCents: bigint;
  /** Saldo travado = valor sugerido do RAD; a elegibilidade legal é do contador. */
  lockedCents: bigint;
  hasDecision: boolean;
}

/** Compra com crédito `aApropriar` > 0 e sem RAD confirmado que cubra o saldo. */
export async function radCandidates(db: Db, companyId: string | null = null): Promise<RadCandidate[]> {
  const credits = await db
    .select({
      companyId: rfbCredits.companyId,
      accessKey: rfbCredits.accessKey,
      period: rfbCredits.period,
      aApropriarCents: sql<string>`sum(${rfbCredits.aApropriarCents})::text`,
    })
    .from(rfbCredits)
    .where(companyId ? eq(rfbCredits.companyId, companyId) : undefined)
    .groupBy(rfbCredits.companyId, rfbCredits.accessKey, rfbCredits.period)
    .having(sql`sum(${rfbCredits.aApropriarCents}) > 0`);
  if (credits.length === 0) return [];
  const keys = [...new Set(credits.map((c) => c.accessKey))];
  const invRows = await db
    .select({ id: invoices.id, companyId: invoices.companyId, accessKey: invoices.accessKey, cnpj: invoices.counterpartyCnpj })
    .from(invoices)
    .where(and(inArray(invoices.accessKey, keys), eq(invoices.direction, "compra")));
  const invByKey = new Map(invRows.map((i) => [`${i.companyId}|${i.accessKey}`, i]));
  const paid = await db
    .select({ companyId: rfbPayments.companyId, accessKey: rfbPayments.accessKey, cents: sql<string>`sum(${rfbPayments.principalCents})::text` })
    .from(rfbPayments)
    .where(and(eq(rfbPayments.type, RAD_TYPE), inArray(rfbPayments.accessKey, keys)))
    .groupBy(rfbPayments.companyId, rfbPayments.accessKey);
  const paidByKey = new Map(paid.map((p) => [`${p.companyId}|${p.accessKey}`, BigInt(p.cents)]));
  const decided = await db
    .select({ companyId: radProposals.companyId, accessKey: radProposals.accessKey })
    .from(radProposals)
    .where(and(inArray(radProposals.accessKey, keys), inArray(radProposals.state, [...DECIDED_STATES])));
  const decidedKeys = new Set(decided.map((d) => `${d.companyId}|${d.accessKey}`));

  const out: RadCandidate[] = [];
  for (const c of credits) {
    const k = `${c.companyId}|${c.accessKey}`;
    const inv = invByKey.get(k);
    if (!inv) continue;
    const aApropriar = BigInt(c.aApropriarCents);
    const confirmed = paidByKey.get(k) ?? 0n;
    const locked = aApropriar > confirmed ? aApropriar - confirmed : 0n;
    if (locked === 0n) continue;
    out.push({
      companyId: c.companyId,
      invoiceId: inv.id,
      accessKey: c.accessKey,
      period: c.period,
      counterpartyCnpj: inv.cnpj,
      aApropriarCents: aApropriar,
      confirmedRadCents: confirmed,
      lockedCents: locked,
      hasDecision: decidedKeys.has(k),
    });
  }
  return out.sort((a, b) => (a.lockedCents === b.lockedCents ? a.accessKey.localeCompare(b.accessKey) : a.lockedCents > b.lockedCents ? -1 : 1));
}

export interface CompanyMetrics {
  id: string;
  name: string;
  cnpj: string;
  segment: string;
  items: number;
  byStatus: Record<string, number>;
  riskCents: bigint;
  lockedCents: bigint;
  decisions: number;
  reconciled: boolean;
}

/** Dinheiro em risco, crédito travado e decisões pendentes por cliente; ordem: risco desc, nome. */
export async function portfolioMetrics(db: Db, companyId: string | null = null): Promise<CompanyMetrics[]> {
  const list = await db
    .select({ id: companies.id, name: companies.name, cnpj: companies.cnpj, segment: companies.segment })
    .from(companies)
    .where(companyId ? eq(companies.id, companyId) : undefined);
  const agg = await db
    .select({
      companyId: reconciliationItems.companyId,
      status: reconciliationItems.status,
      n: sql<number>`count(*)`.mapWith(Number),
      diffAbs: sql<string>`coalesce(sum(abs(${reconciliationItems.diffCents})), 0)::text`,
      invoice: sql<string>`coalesce(sum(${reconciliationItems.invoiceCents}), 0)::text`,
      rfb: sql<string>`coalesce(sum(${reconciliationItems.rfbCents}), 0)::text`,
    })
    .from(reconciliationItems)
    .where(companyId ? eq(reconciliationItems.companyId, companyId) : undefined)
    .groupBy(reconciliationItems.companyId, reconciliationItems.status);
  const candidates = await radCandidates(db, companyId);

  const rows = list.map<CompanyMetrics>((c) => ({ ...c, items: 0, byStatus: {}, riskCents: 0n, lockedCents: 0n, decisions: 0, reconciled: false }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const a of agg) {
    const r = byId.get(a.companyId);
    if (!r) continue;
    r.reconciled = true;
    r.items += a.n;
    r.byStatus[a.status] = a.n;
    if (a.status === "divergente_valor") {
      r.riskCents += BigInt(a.diffAbs);
      r.decisions += a.n;
    } else if (a.status === "so_na_nota") r.riskCents += BigInt(a.invoice);
    else if (a.status === "so_na_receita") r.riskCents += BigInt(a.rfb);
  }
  for (const c of candidates) {
    const r = byId.get(c.companyId);
    if (!r) continue;
    r.lockedCents += c.lockedCents;
    r.riskCents += c.lockedCents;
    if (!c.hasDecision) r.decisions++;
  }
  return rows.sort((a, b) => (a.riskCents === b.riskCents ? a.name.localeCompare(b.name, "pt-BR") : a.riskCents > b.riskCents ? -1 : 1));
}

export function portfolioTotals(rows: CompanyMetrics[]) {
  return rows.reduce(
    (t, r) => ({ riskCents: t.riskCents + r.riskCents, lockedCents: t.lockedCents + r.lockedCents, decisions: t.decisions + r.decisions, items: t.items + r.items }),
    { riskCents: 0n, lockedCents: 0n, decisions: 0, items: 0 },
  );
}
