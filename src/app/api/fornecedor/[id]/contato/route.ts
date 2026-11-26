import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isSimulado } from "@/lib/config";
import { clientIp, limitPerIp } from "@/services/demo";
import { findSupplierContact } from "@/services/fornecedor";
import { createScraper } from "@/services/vigia/scrape";
import { requireOperator, supplierRoute } from "../../http";

export const dynamic = "force-dynamic";

/** Vigia busca o e-mail financeiro no site do fornecedor (lista fechada, CNPJ conferido). REAL: Bearer CRON_SECRET. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request);
  if (denied) return denied;
  // Na demo pública, 1 busca por minuto por IP: o Firecrawl tem cota compartilhada com o Radar.
  if (isSimulado()) {
    const retry = await limitPerIp(getDb(), { action: "fornecedor.contato", ip: clientIp(request.headers) });
    if (retry !== null) return NextResponse.json({ erro: `Aguarde ${retry} s para buscar de novo (1 busca por minuto).`, codigo: "LIMITE_BUSCA" }, { status: 429, headers: { "Retry-After": String(retry) } });
  }
  return supplierRoute(request, ctx, ({ db, actor, id }) => findSupplierContact({ db, scraper: createScraper() }, id, actor));
}
