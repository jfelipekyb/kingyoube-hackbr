// Leitura real das 9 páginas pelo Firecrawl (uma vez), gravando na base local. Não imprime a chave.
import { getDb } from "@/db/client";
import { checkDocs } from "@/services/vigia/radar";
import { createScraper } from "@/services/vigia/scrape";

async function main() {
const scraper = createScraper();
if (!scraper) throw new Error("FIRECRAWL_API_KEY ausente");
const started = Date.now();
const r = await checkDocs({ db: getDb(), scraper }, "usuario:devin-leitura-real");
console.table(r.pages.map((p) => ({ pagina: p.title, firecrawl: p.firecrawl, publicada: p.version ?? "—", codigo: p.codeVersion ?? "—", mudou: p.changed, desatualizado: p.codeOutdated, erro: p.error ?? "" })));
console.log(`paginas=${r.pages.length} mudaram=${r.changed} erros=${r.errors} segundos=${Math.round((Date.now() - started) / 1000)}`);
process.exit(0);
}
void main();
