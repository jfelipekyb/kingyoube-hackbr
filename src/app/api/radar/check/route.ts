import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { recordAudit } from "@/services/auditoria";
import { isAuthorizedCron } from "@/services/demo";
import { checkDocs } from "@/services/vigia/radar";
import { createScraper } from "@/services/vigia/scrape";

export const dynamic = "force-dynamic";
// 9 páginas em fila (6,5 s entre elas) levam cerca de 1 a 2 minutos (leitura real: 117 s).
export const maxDuration = 300;

/** Vercel Cron diário e chamada de operador: sempre `Authorization: Bearer <CRON_SECRET>`. O botão da tela usa a ação do servidor. */
async function handle(request: Request) {
  const db = getDb();
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    await recordAudit(db, { actor: "sistema:cron", action: "radar.verificar", entity: "doc_watch", result: "nao_autorizado" });
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const scraper = createScraper();
  if (!scraper) return NextResponse.json({ erro: "FIRECRAWL_API_KEY não configurada" }, { status: 503 });
  const r = await checkDocs({ db, scraper }, "sistema:cron");
  return NextResponse.json({ paginas: r.pages.map((p) => ({ titulo: p.title, firecrawl: p.firecrawl, versao: p.version, codigo: p.codeVersion, mudou: p.changed })), mudaram: r.changed, erros: r.errors });
}

export const POST = handle;
// O Vercel Cron chama com GET; a mesma trava de CRON_SECRET vale para os dois.
export const GET = handle;
