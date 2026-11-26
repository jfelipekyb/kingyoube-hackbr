// Firecrawl do Vigia (docs/05): só a lista fechada de URLs. Qualquer outra é recusada antes de chamar a API.
import { Firecrawl } from "firecrawl";
import type { Env } from "@/lib/config";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";

export interface ScrapeResult {
  markdown?: string;
  json?: unknown;
  changeTracking?: Record<string, unknown>;
}
export interface Scraper {
  scrape(url: string, options: Record<string, unknown>): Promise<ScrapeResult>;
}

export class ScrapeNotAllowedError extends Error {
  constructor(public readonly url: string) {
    super("URL fora da lista fechada do Vigia (docs/05): recusada sem chamar o Firecrawl.");
  }
}

export const RADAR_URLS = WATCHED_PAGES.map((p) => `${RECEITA_DOCS_BASE}${p.page}`);
const SUPPLIER_PATH = /^\/demo\/fornecedores\/[a-z0-9-]+$/;

/** As 9 páginas oficiais, ou `${APP_URL}/demo/fornecedores/<slug>`. */
export function isAllowedUrl(url: string, env: Env = process.env): boolean {
  if (RADAR_URLS.includes(url)) return true;
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, "");
  if (!appUrl || !url.startsWith(`${appUrl}/`)) return false;
  return SUPPLIER_PATH.test(url.slice(appUrl.length));
}

export async function guardedScrape(scraper: Scraper, url: string, options: Record<string, unknown>, env: Env = process.env): Promise<ScrapeResult> {
  if (!isAllowedUrl(url, env)) throw new ScrapeNotAllowedError(url);
  return scraper.scrape(url, options);
}

/** Cliente real; sem FIRECRAWL_API_KEY devolve null (a tela avisa). A chave nunca vai para log. */
export function createScraper(env: Env = process.env): Scraper | null {
  const apiKey = env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) return null;
  const fc = new Firecrawl({ apiKey });
  return { scrape: (url, options) => fc.scrape(url, options) as Promise<ScrapeResult> };
}
