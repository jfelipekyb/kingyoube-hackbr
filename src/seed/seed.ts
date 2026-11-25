// Seed idempotente (docs/06): recria a base de demonstração do zero. Não apaga a auditoria.
import { count } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import { buildDemoData, DEMO_USERS } from "./demo-data";
import { EFFORT_STANDARDS } from "./effort";

export interface SeedOptions {
  demoToday: string;
  appUrl?: string;
  actor?: string;
  reason?: string;
}

export interface SeedCounts {
  companies: number;
  users: number;
  counterparties: number;
  invoices: number;
  effortStandards: number;
  docWatch: number;
}

/** Tabelas apagadas no reset, em ordem segura para as chaves estrangeiras. audit_log fica. */
const RESET_ORDER = [
  s.emailEvents,
  s.outboundEmails,
  s.radProposals,
  s.reconciliationItems,
  s.rfbPayments,
  s.rfbCredits,
  s.rfbDebits,
  s.rfbRawFiles,
  s.rfbRequests,
  s.agentEvents,
  s.agentRuns,
  s.kimQueries,
  s.invoices,
  s.counterparties,
  s.companies,
  s.users,
  s.effortStandards,
  s.docWatch,
] as const;

export async function seedDemo(db: Db, options: SeedOptions): Promise<SeedCounts> {
  const data = buildDemoData(options.demoToday);
  const appUrl = (options.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const companyId = new Map(data.companies.map((c) => [c.slug, c.id]));

  await db.transaction(async (tx) => {
    for (const table of RESET_ORDER) await tx.delete(table);

    await tx.insert(s.users).values(DEMO_USERS);
    await tx.insert(s.companies).values(
      data.companies.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj, cnpjRoot: c.cnpjRoot, segment: c.segment, isDemo: true })),
    );
    await tx.insert(s.counterparties).values(
      data.counterparties.map((c) => ({
        id: c.id,
        cnpj: c.cnpj,
        name: c.name,
        siteUrl: c.siteUrlPath ? `${appUrl}${c.siteUrlPath}` : null,
        financeEmail: c.financeEmail,
        contactSource: "cadastro" as const,
        isDemo: true,
      })),
    );
    const rows = data.invoices.map((inv) => ({
      id: inv.id,
      companyId: companyId.get(inv.companySlug)!,
      accessKey: inv.accessKey,
      direction: inv.direction,
      docModel: inv.docModel,
      counterpartyCnpj: inv.counterpartyCnpj,
      issuedAt: new Date(inv.issuedAt),
      period: inv.period,
      totalCents: inv.totalCents,
      cbsCents: inv.cbsCents,
      source: "seed" as const,
    }));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(s.invoices).values(rows.slice(i, i + 200));
    await tx.insert(s.effortStandards).values(EFFORT_STANDARDS.map((e) => ({ ...e, source: "premissa", updatedBy: "seed" })));
    await tx.insert(s.docWatch).values(
      WATCHED_PAGES.map((p) => ({ url: `${RECEITA_DOCS_BASE}${p.page}`, title: p.title, lastVersion: p.version })),
    );
  });

  const counts = await countDemo(db);
  await recordAudit(db, {
    actor: options.actor ?? "sistema:seed",
    action: "demo.seed",
    entity: "base_demo",
    result: "ok",
    details: { reason: options.reason ?? "seed", demoToday: options.demoToday, ...counts },
  });
  return counts;
}

export async function countDemo(db: Db): Promise<SeedCounts> {
  const n = async (table: (typeof RESET_ORDER)[number]) => {
    const [row] = await db.select({ n: count() }).from(table);
    return Number(row.n);
  };
  return {
    companies: await n(s.companies),
    users: await n(s.users),
    counterparties: await n(s.counterparties),
    invoices: await n(s.invoices),
    effortStandards: await n(s.effortStandards),
    docWatch: await n(s.docWatch),
  };
}
