import { asc, count, eq, sql } from "drizzle-orm";
import { companies, invoices } from "@/db/schema";
import type { Db } from "@/db/types";

export async function listCompanies(db: Db) {
  return db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name));
}

export async function portfolioOverview(db: Db) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      cnpj: companies.cnpj,
      segment: companies.segment,
      invoices: count(invoices.id),
      sales: sql<number>`count(*) filter (where ${invoices.direction} = 'venda')`.mapWith(Number),
      purchases: sql<number>`count(*) filter (where ${invoices.direction} = 'compra')`.mapWith(Number),
      cbsCents: sql<string>`coalesce(sum(${invoices.cbsCents}), 0)::text`,
    })
    .from(companies)
    .leftJoin(invoices, eq(invoices.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(asc(companies.name));
}
