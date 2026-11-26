// Semáforos de fornecedores e de clientes (docs/11): regra pura, nunca modelo de linguagem.
import { and, eq, inArray, sql } from "drizzle-orm";
import { counterparties, invoices, rfbCredits, rfbDebits, rfbPayments } from "@/db/schema";
import type { Db } from "@/db/types";

const RAD_TYPE = 1;

export type Light = "verde" | "amarelo" | "vermelho";
export type RadAgreement = "aceita" | "recusa" | "sem_resposta";
export type Receipt = "recebido" | "a_receber" | "vencido";

export const LIGHT_LABEL: Record<Light, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };

export const SUPPLIER_RECOMMENDATION: Record<Light, string> = {
  verde: "Nenhuma ação",
  amarelo: "Recolher via RAD (a Tesouraria prepara; o contador aprova) e cobrar o fornecedor",
  vermelho: "Não pagar a parte da CBS até regularizar, negociar ou trocar de fornecedor; RAD só com decisão expressa do contador, com aviso de disputa",
};

export const CUSTOMER_RECOMMENDATION: Record<Light, string> = {
  verde: "Nenhuma ação",
  amarelo: "Cobrar o cliente antes do vencimento da CBS",
  vermelho: "Recolher a CBS para não gerar multa e cobrar o cliente; avaliar suspender novas vendas a prazo",
};

export interface SupplierPurchase {
  aApropriarCents: bigint;
  confirmedRadCents: bigint;
}

/** Verde: todo crédito apropriado ou regularizado por RAD; amarelo: não recolheu e aceita/sem resposta; vermelho: não recolheu e recusou. */
export function supplierLight(input: { radAgreement: RadAgreement; purchases: SupplierPurchase[] }): { light: Light; regularizedByRad: boolean } {
  const regularizedByRad = input.purchases.some((p) => p.confirmedRadCents > 0n);
  const notCollected = input.purchases.some((p) => p.aApropriarCents > p.confirmedRadCents);
  if (!notCollected) return { light: "verde", regularizedByRad };
  return { light: input.radAgreement === "recusa" ? "vermelho" : "amarelo", regularizedByRad };
}

/** Verde: recebido ou CBS sem saldo devedor; amarelo: a receber com CBS em aberto; vermelho: vencido com CBS em aberto. */
export function customerLight(input: { receipt: Receipt | null; saldoDevedorCents: bigint | null }): Light {
  const open = input.saldoDevedorCents === null || input.saldoDevedorCents > 0n;
  if (!open || input.receipt === null || input.receipt === "recebido") return "verde";
  return input.receipt === "vencido" ? "vermelho" : "amarelo";
}

export interface SupplierRow {
  counterpartyId: string;
  name: string;
  cnpj: string;
  financeEmail: string | null;
  radAgreement: RadAgreement;
  purchases: number;
  lockedCents: bigint;
  light: Light;
  regularizedByRad: boolean;
  recommendation: string;
}

export async function supplierLights(db: Db, companyId: string): Promise<SupplierRow[]> {
  const rows = await db
    .select({
      id: counterparties.id,
      name: counterparties.name,
      cnpj: counterparties.cnpj,
      financeEmail: counterparties.financeEmail,
      radAgreement: counterparties.radAgreement,
      purchases: sql<number>`count(${invoices.id})`.mapWith(Number),
      keys: sql<string[]>`array_agg(${invoices.accessKey})`,
    })
    .from(invoices)
    .innerJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
    .where(and(eq(invoices.companyId, companyId), eq(invoices.direction, "compra")))
    .groupBy(counterparties.id);
  const credits = await db
    .select({ accessKey: rfbCredits.accessKey, cents: sql<string>`sum(${rfbCredits.aApropriarCents})::text` })
    .from(rfbCredits)
    .where(eq(rfbCredits.companyId, companyId))
    .groupBy(rfbCredits.accessKey);
  const rad = await db
    .select({ accessKey: rfbPayments.accessKey, cents: sql<string>`sum(${rfbPayments.principalCents})::text` })
    .from(rfbPayments)
    .where(and(eq(rfbPayments.companyId, companyId), eq(rfbPayments.type, RAD_TYPE)))
    .groupBy(rfbPayments.accessKey);
  const radByKey = new Map(rad.map((r) => [r.accessKey, BigInt(r.cents)]));
  const byKey = new Map(
    credits.map((c) => {
      const aApropriarCents = BigInt(c.cents);
      const confirmedRadCents = radByKey.get(c.accessKey) ?? 0n;
      return [c.accessKey, { aApropriarCents, confirmedRadCents, lockedCents: aApropriarCents > confirmedRadCents ? aApropriarCents - confirmedRadCents : 0n }];
    }),
  );
  for (const [k, cents] of radByKey) if (k && !byKey.has(k)) byKey.set(k, { aApropriarCents: 0n, confirmedRadCents: cents, lockedCents: 0n });
  return rows
    .map((r) => {
      const purchases = r.keys.flatMap((k) => {
        const c = byKey.get(k);
        return c ? [{ aApropriarCents: c.aApropriarCents, confirmedRadCents: c.confirmedRadCents }] : [];
      });
      const { light, regularizedByRad } = supplierLight({ radAgreement: r.radAgreement, purchases });
      return {
        counterpartyId: r.id,
        name: r.name,
        cnpj: r.cnpj,
        financeEmail: r.financeEmail,
        radAgreement: r.radAgreement,
        purchases: r.purchases,
        lockedCents: r.keys.reduce((t, k) => t + (byKey.get(k)?.lockedCents ?? 0n), 0n),
        light,
        regularizedByRad,
        recommendation: SUPPLIER_RECOMMENDATION[light],
      };
    })
    .sort(byLight);
}

export interface CustomerRow {
  invoiceId: string;
  accessKey: string;
  customerName: string | null;
  customerCnpj: string;
  issuedAt: Date;
  cbsCents: bigint;
  receipt: Receipt | null;
  titleDueDate: string | null;
  saldoDevedorCents: bigint | null;
  light: Light;
  recommendation: string;
}

export async function customerLights(db: Db, companyId: string): Promise<CustomerRow[]> {
  const sales = await db
    .select({
      invoiceId: invoices.id,
      accessKey: invoices.accessKey,
      period: invoices.period,
      customerName: counterparties.name,
      customerCnpj: invoices.counterpartyCnpj,
      issuedAt: invoices.issuedAt,
      cbsCents: invoices.cbsCents,
      receipt: invoices.receipt,
      titleDueDate: invoices.titleDueDate,
    })
    .from(invoices)
    .leftJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
    .where(and(eq(invoices.companyId, companyId), eq(invoices.direction, "venda")));
  const keys = sales.map((x) => x.accessKey);
  const debts = keys.length
    ? await db
        .select({ accessKey: rfbDebits.accessKey, period: rfbDebits.period, saldo: sql<string>`sum(${rfbDebits.saldoDevedorCents})::text` })
        .from(rfbDebits)
        .where(and(eq(rfbDebits.companyId, companyId), inArray(rfbDebits.accessKey, keys)))
        .groupBy(rfbDebits.accessKey, rfbDebits.period)
    : [];
  const saldo = new Map(debts.map((d) => [`${d.accessKey}|${d.period}`, BigInt(d.saldo)]));
  return sales
    .map((x) => {
      const saldoDevedorCents = saldo.get(`${x.accessKey}|${x.period}`) ?? null;
      const light = customerLight({ receipt: x.receipt, saldoDevedorCents });
      return {
        invoiceId: x.invoiceId,
        accessKey: x.accessKey,
        customerName: x.customerName,
        customerCnpj: x.customerCnpj,
        issuedAt: x.issuedAt,
        cbsCents: x.cbsCents,
        receipt: x.receipt,
        titleDueDate: x.titleDueDate,
        saldoDevedorCents,
        light,
        recommendation: CUSTOMER_RECOMMENDATION[light],
      };
    })
    .sort(byLight);
}

const ORDER: Record<Light, number> = { vermelho: 0, amarelo: 1, verde: 2 };
function byLight<T extends { light: Light }>(a: T, b: T) {
  return ORDER[a.light] - ORDER[b.light];
}

export function countByLight(rows: { light: Light }[]): Record<Light, number> {
  const out: Record<Light, number> = { vermelho: 0, amarelo: 0, verde: 0 };
  for (const r of rows) out[r.light]++;
  return out;
}

/** Contagem de amarelos e vermelhos por cliente, para as bolinhas da Carteira. */
export async function portfolioLights(db: Db, companyIds: string[]) {
  const out = new Map<string, { suppliers: Record<Light, number>; customers: Record<Light, number> }>();
  for (const id of companyIds) {
    out.set(id, { suppliers: countByLight(await supplierLights(db, id)), customers: countByLight(await customerLights(db, id)) });
  }
  return out;
}
