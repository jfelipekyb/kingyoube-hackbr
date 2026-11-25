// Escolha do adaptador por RECEITA_MODE. Telas e rotas nunca falam com a Receita direto.
import { and, eq } from "drizzle-orm";
import { companies, invoices, radProposals } from "@/db/schema";
import type { Db } from "@/db/types";
import { demoToday } from "@/lib/clock";
import { receitaMode, type Env } from "@/lib/config";
import { RealAdapter, realConfigFromEnv } from "./real";
import { SimuladoAdapter } from "./simulado";
import { ReceitaError, type ReceitaAdapter, type ResolveCompany } from "./types";

export class ReceitaConfigError extends Error {}

export function companyResolver(db: Db): ResolveCompany {
  return async (companyId) => {
    const [c] = await db
      .select({ id: companies.id, cnpj: companies.cnpj, cnpjRoot: companies.cnpjRoot })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (!c) throw new ReceitaError("REQUISICAO_INVALIDA", "cliente desconhecido", 400);
    return c;
  };
}

export function createReceitaAdapter(
  db: Db,
  env: Env = process.env,
  options: { now?: () => Date; fetch?: typeof fetch } = {},
): ReceitaAdapter {
  const resolveCompany = companyResolver(db);
  if (receitaMode(env) === "SIMULADO") {
    return new SimuladoAdapter({
      resolveCompany,
      demoToday: demoToday(env),
      rapido: env.SIMULADO_RAPIDO?.trim().toLowerCase() === "true",
      now: options.now,
      radCollections: async (cnpjRoot) => {
        const rows = await db
          .select({
            proposalId: radProposals.id,
            accessKey: radProposals.accessKey,
            period: invoices.period,
            dueDate: radProposals.dueDate,
            supplierCnpj: invoices.counterpartyCnpj,
            principalCents: radProposals.principalCents,
          })
          .from(radProposals)
          .innerJoin(invoices, eq(invoices.id, radProposals.invoiceId))
          .innerJoin(companies, eq(companies.id, radProposals.companyId))
          .where(and(eq(radProposals.state, "darf_gerado"), eq(companies.cnpjRoot, cnpjRoot)));
        return rows
          .filter((r) => r.principalCents !== null)
          .map((r) => ({ ...r, dueDate: r.dueDate ?? demoToday(env), principalCents: r.principalCents! }));
      },
      findDocument: async (companyId, accessKey) => {
        const [inv] = await db
          .select({ cbsCents: invoices.cbsCents })
          .from(invoices)
          .where(and(eq(invoices.companyId, companyId), eq(invoices.accessKey, accessKey)));
        return inv ?? null;
      },
    });
  }
  const config = realConfigFromEnv(env);
  if (!config) {
    throw new ReceitaConfigError("Modo REAL exige RFB_CLIENT_ID, RFB_CLIENT_SECRET, RFB_TOKEN_URL e RFB_CNPJ");
  }
  return new RealAdapter(config, { resolveCompany, fetch: options.fetch, now: options.now });
}
