// Radar da documentação oficial (docs/05): Firecrawl com changeTracking, fila de 9 páginas abaixo de 10/min.
import { eq } from "drizzle-orm";
import { docWatch } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Env } from "@/lib/config";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";
import { sendEmailOnce } from "@/services/notificacao";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import { guardedScrape, RADAR_URLS, type Scraper } from "./scrape";

/** 9 páginas a cada 6,5 s ficam abaixo dos 10 scrapes/min do plano grátis. */
export const RADAR_INTERVAL_MS = 6_500;
export const RADAR_FORMATS = ["markdown", { type: "changeTracking", modes: ["git-diff"], tag: "receita-cbs" }];
const MAX_DIFF = 20_000;

export type FirecrawlChange = "new" | "same" | "changed" | "removed";
export interface PageCheck {
  url: string;
  title: string;
  firecrawl: FirecrawlChange | "erro";
  version: string | null;
  previousVersion: string | null;
  codeVersion: string | null;
  changed: boolean;
  codeOutdated: boolean;
  alerted: boolean;
  error?: string;
}

/** Versão atual = a maior da tabela "Histórico de versão" (linhas "dd/mm/aaaa | x.y"). */
export function extractVersion(markdown: string): string | null {
  const start = markdown.search(/hist[óo]rico de vers/i);
  if (start < 0) return null;
  const section = markdown.slice(start, start + 6_000);
  let best: string | null = null;
  for (const m of section.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b[\s|*]*v?(\d+\.\d+(?:\.\d+)?)\b/g)) {
    if (!best || compareVersions(m[1], best) > 0) best = m[1];
  }
  return best;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface RadarDeps {
  db: Db;
  scraper: Scraper;
  env?: Env;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export async function checkDocs(deps: RadarDeps, actor = "sistema:cron"): Promise<{ pages: PageCheck[]; changed: number; errors: number }> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => new Date());
  const pages: PageCheck[] = [];
  for (const [i, url] of RADAR_URLS.entries()) {
    if (i > 0) await sleep(RADAR_INTERVAL_MS);
    const spec = WATCHED_PAGES.find((p) => `${RECEITA_DOCS_BASE}${p.page}` === url)!;
    const [row] = await db.select().from(docWatch).where(eq(docWatch.url, url));
    const previousVersion = row?.lastVersion ?? null;
    const base = { url, title: spec.title, previousVersion, codeVersion: spec.version };
    try {
      const res = await guardedScrape(deps.scraper, url, { formats: RADAR_FORMATS }, env);
      const ct = (res.changeTracking ?? {}) as { changeStatus?: string; diff?: { text?: string } };
      const firecrawl = (["new", "same", "changed", "removed"].includes(ct.changeStatus ?? "") ? ct.changeStatus : "new") as FirecrawlChange;
      const version = firecrawl === "removed" ? previousVersion : (extractVersion(res.markdown ?? "") ?? previousVersion);
      const versionMoved = Boolean(version && previousVersion && version !== previousVersion);
      const changed = firecrawl === "changed" || firecrawl === "removed" || versionMoved;
      const codeOutdated = Boolean(version && spec.version && compareVersions(version, spec.version) > 0);
      const diffText = changed
        ? (ct.diff?.text ?? (firecrawl === "removed" ? "A página saiu do ar." : `Versão ${previousVersion} → ${version}.`)).slice(0, MAX_DIFF)
        : null;
      const at = now();
      const values = {
        title: spec.title,
        lastVersion: version,
        lastCheckedAt: at,
        changeStatus: changed ? ("mudou" as const) : ("sem_mudanca" as const),
        ...(changed ? { diffText, alertedAt: null } : {}),
      };
      const [saved] = row
        ? await db.update(docWatch).set(values).where(eq(docWatch.id, row.id)).returning()
        : await db.insert(docWatch).values({ url, ...values }).returning();
      let alerted = false;
      if (changed) {
        const label = `${spec.title} ${previousVersion ?? "?"} → ${version ?? "?"}`;
        const { row: email } = await sendEmailOnce(deps, {
          kind: "alerta_radar",
          refId: saved.id,
          key: `radar-${saved.id}-${version ?? "sem-versao"}-${at.toISOString().slice(0, 10)}`,
          to: env.ALERT_EMAIL,
          fallbackLabel: "time (ALERT_EMAIL não cadastrado)",
          subject: `Contrato da Receita mudou: ${label}`,
          lines: [
            `O Vigia encontrou mudança na documentação oficial da Receita: ${label}.`,
            `Página: ${url}`,
            codeOutdated ? `O código implementa a versão ${spec.version}: código desatualizado.` : "A versão do código continua compatível; confira o diff.",
            "Diff (git-diff do Firecrawl):",
            (diffText ?? "").slice(0, 4_000),
          ],
        });
        alerted = email.lastStatus !== "erro";
        if (alerted) await db.update(docWatch).set({ changeStatus: "alertado", alertedAt: at }).where(eq(docWatch.id, saved.id));
        await recordAudit(db, { actor, action: "radar.alerta", entity: "doc_watch", entityId: saved.id, result: email.lastStatus ?? "simulado", details: { url, de: previousVersion, para: version, para_email: email.toLabel } });
      }
      pages.push({ ...base, firecrawl, version, changed, codeOutdated, alerted });
    } catch (e) {
      pages.push({ ...base, firecrawl: "erro", version: previousVersion, changed: false, codeOutdated: false, alerted: false, error: e instanceof Error ? e.message : "erro" });
    }
  }
  const changed = pages.filter((p) => p.changed).length;
  const errors = pages.filter((p) => p.firecrawl === "erro").length;
  await recordAgentEvent(db, {
    agent: "vigia",
    action: "radar_verificado",
    entity: "doc_watch",
    status: errors > 0 ? "erro" : "feito",
    summary:
      changed > 0
        ? `Conferi ${pages.length} páginas da Receita: ${changed} ${changed === 1 ? "mudou" : "mudaram"} e o time foi avisado`
        : `Conferi ${pages.length - errors} de ${pages.length} páginas da Receita: nenhuma mudança${errors ? `; ${errors} com erro` : ""}`,
    count: pages.length - errors,
    minutesSaved: (pages.length - errors) * 3,
  });
  await recordAudit(db, {
    actor,
    action: "radar.verificar",
    entity: "doc_watch",
    result: errors > 0 ? "parcial" : "ok",
    details: { paginas: pages.length, mudaram: changed, erros: errors, versoes: Object.fromEntries(pages.map((p) => [p.title, p.version])) },
  });
  return { pages, changed, errors };
}
