// Leitura dos itens de conciliação para as telas (sem recalcular nada).
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { companies, counterparties, invoices, reconciliationItems, rfbCredits, rfbDebits } from "@/db/schema";
import type { Db } from "@/db/types";
import { radCandidates } from "@/services/carteira/metrics";
import type { ItemKind, ItemStatus } from "./rules";

export interface ItemFilters {
  companyId?: string | null;
  status?: ItemStatus | null;
  kind?: ItemKind | null;
  onlyAttention?: boolean;
}

export async function listItems(db: Db, f: ItemFilters) {
  const where: SQL[] = [];
  if (f.companyId) where.push(eq(reconciliationItems.companyId, f.companyId));
  if (f.status) where.push(eq(reconciliationItems.status, f.status));
  if (f.kind) where.push(eq(reconciliationItems.kind, f.kind));
  if (f.onlyAttention) where.push(sql`${reconciliationItems.status} <> 'conciliado'`);
  return db
    .select({
      id: reconciliationItems.id,
      companyId: reconciliationItems.companyId,
      companyName: companies.name,
      accessKey: reconciliationItems.accessKey,
      period: reconciliationItems.period,
      kind: reconciliationItems.kind,
      status: reconciliationItems.status,
      ruleId: reconciliationItems.ruleId,
      invoiceCents: reconciliationItems.invoiceCents,
      rfbCents: reconciliationItems.rfbCents,
      diffCents: reconciliationItems.diffCents,
      counterpartyName: counterparties.name,
    })
    .from(reconciliationItems)
    .innerJoin(companies, eq(companies.id, reconciliationItems.companyId))
    .leftJoin(invoices, eq(invoices.id, reconciliationItems.invoiceId))
    .leftJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`case when ${reconciliationItems.status} = 'conciliado' then 1 else 0 end`, desc(sql`abs(coalesce(${reconciliationItems.diffCents}, ${reconciliationItems.invoiceCents}, ${reconciliationItems.rfbCents}, 0))`), asc(reconciliationItems.accessKey))
    .limit(500);
}

export async function itemDetail(db: Db, id: string) {
  const [item] = await db
    .select({ item: reconciliationItems, companyName: companies.name, companyCnpj: companies.cnpj })
    .from(reconciliationItems)
    .innerJoin(companies, eq(companies.id, reconciliationItems.companyId))
    .where(eq(reconciliationItems.id, id));
  if (!item) return null;
  const { companyId, accessKey, period, kind } = item.item;
  const [invoice] = item.item.invoiceId
    ? await db
        .select({ invoice: invoices, counterpartyName: counterparties.name })
        .from(invoices)
        .leftJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
        .where(eq(invoices.id, item.item.invoiceId))
    : [];
  const receita =
    kind === "debito"
      ? (await db.select().from(rfbDebits).where(and(eq(rfbDebits.companyId, companyId), eq(rfbDebits.accessKey, accessKey), eq(rfbDebits.period, period))).orderBy(asc(rfbDebits.origin))).map((r) => ({
          origin: r.origin,
          registeredAt: r.registeredAt,
          updatedAt: r.updatedAt,
          apuradoCents: r.apuradoCents,
          fields: [
            ["Suspenso", r.suspensoCents],
            ["Inexigível", r.inexigivelCents],
            ["Extinto", r.extintoCents],
            ["Saldo devedor", r.saldoDevedorCents],
          ] as [string, bigint][],
        }))
      : (await db.select().from(rfbCredits).where(and(eq(rfbCredits.companyId, companyId), eq(rfbCredits.accessKey, accessKey), eq(rfbCredits.period, period))).orderBy(asc(rfbCredits.origin))).map((r) => ({
          origin: r.origin,
          registeredAt: r.registeredAt,
          updatedAt: r.updatedAt,
          apuradoCents: r.apuradoCents,
          fields: [
            ["Apropriado", r.apropriadoCents],
            ["A apropriar", r.aApropriarCents],
            ["Suspenso", r.suspensoCents],
            ["Inapropriável", r.inapropriavelCents],
            ["Prescrito", r.prescritoCents],
            ["Saldo credor", r.saldoCredorCents],
          ] as [string, bigint][],
        }));
  const rad = kind === "credito" ? (await radCandidates(db, companyId)).find((c) => c.accessKey === accessKey && c.period === period) ?? null : null;
  return { ...item, invoice: invoice ?? null, receita, rad };
}
