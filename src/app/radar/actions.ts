"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { isSimulado } from "@/lib/config";
import { clientIp, limitPerIp } from "@/services/demo";
import { checkDocs } from "@/services/vigia/radar";
import { createScraper } from "@/services/vigia/scrape";

export type RadarActionResult = { ok: true; pages: number; changed: number; errors: number } | { ok: false; message: string };

/** Botão "Verificar agora": na demonstração (SIMULADO), 1 verificação a cada 10 minutos por IP para poupar os créditos do Firecrawl. */
export async function verifyNow(): Promise<RadarActionResult> {
  if (!isSimulado()) return { ok: false, message: "Em modo REAL, a verificação roda pelo cron diário (Bearer CRON_SECRET); login de verdade fica fora do hack." };
  const db = getDb();
  const retry = await limitPerIp(db, { action: "radar.verificar_botao", ip: clientIp(await headers()), windowMs: 10 * 60_000 });
  if (retry !== null) return { ok: false, message: `Já verificamos há pouco. Tente de novo em ${Math.ceil(retry / 60)} min.` };
  const scraper = createScraper();
  if (!scraper) return { ok: false, message: "FIRECRAWL_API_KEY não configurada: o Vigia não consegue ler as páginas." };
  const r = await checkDocs({ db, scraper }, "usuario:botao-radar");
  revalidatePath("/radar");
  return { ok: true, pages: r.pages.length, changed: r.changed, errors: r.errors };
}
