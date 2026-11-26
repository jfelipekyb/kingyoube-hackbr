import { findSupplierContact } from "@/services/fornecedor";
import { createScraper } from "@/services/vigia/scrape";
import { requireOperator, supplierRoute } from "../../http";

export const dynamic = "force-dynamic";

/** Vigia busca o e-mail financeiro no site do fornecedor (lista fechada, CNPJ conferido). REAL: Bearer CRON_SECRET. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request);
  if (denied) return denied;
  return supplierRoute(request, ctx, ({ db, actor, id }) => findSupplierContact({ db, scraper: createScraper() }, id, actor));
}
