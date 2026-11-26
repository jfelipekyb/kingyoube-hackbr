import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { seedDemo } from "@/seed/seed";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import { createTestDb } from "@/test/db";
import { checkDocs, extractVersion, RADAR_INTERVAL_MS } from "./radar";
import { guardedScrape, isAllowedUrl, ScrapeNotAllowedError, type Scraper } from "./scrape";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: "2026-11-20" });
}, 120_000);
afterAll(() => close());

const page = (versions: string[]) =>
  `# Débitos CBS\n\n## 2. Histórico de versão\n\n| Data | Versão | Descrição |\n|---|---|---|\n${versions.map((v, i) => `| 0${i + 1}/10/2026 | ${v} | ajuste |`).join("\n")}\n\n## 3. Regras`;

function fakeFirecrawl(status: string, versions: Record<string, string[]>, diff?: string) {
  const calls: { url: string; options: Record<string, unknown> }[] = [];
  const scraper: Scraper = {
    scrape: async (url, options) => {
      calls.push({ url, options });
      const name = url.slice(RECEITA_DOCS_BASE.length);
      return { markdown: page(versions[name] ?? ["1.0", WATCHED_PAGES.find((p) => p.page === name)?.version ?? "1.0"]), changeTracking: { changeStatus: status, previousScrapeAt: null, ...(diff ? { diff: { text: diff } } : {}) } };
    },
  };
  return { scraper, calls };
}

const env = { RECEITA_MODE: "SIMULADO", ALERT_EMAIL: "time@kingyoube.exemplo" };
const sleeps: number[] = [];
const sleep = async (ms: number) => void sleeps.push(ms);

describe("Vigia: radar da documentação da Receita (docs/05)", () => {
  it("extrai a maior versão da tabela de histórico", () => {
    expect(extractVersion(page(["1.0", "1.1", "1.3", "1.2"]))).toBe("1.3");
    expect(extractVersion("sem tabela")).toBeNull();
  });

  it("new: grava as 9 páginas e versões, em fila abaixo de 10/min, com changeTracking git-diff e tag receita-cbs", async () => {
    const { scraper, calls } = fakeFirecrawl("new", { "debito.html": ["1.0", "1.3"] });
    const r = await checkDocs({ db, scraper, env, sleep });
    expect(calls).toHaveLength(9);
    expect(calls[0].options.formats).toEqual(["markdown", { type: "changeTracking", modes: ["git-diff"], tag: "receita-cbs" }]);
    expect(sleeps).toHaveLength(8);
    expect(sleeps.every((ms) => ms === RADAR_INTERVAL_MS && ms >= 6_000)).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.changed).toBe(0);
    const deb = r.pages.find((p) => p.url.endsWith("debito.html"))!;
    expect(deb).toMatchObject({ firecrawl: "new", version: "1.3", changed: false, codeOutdated: false });
    const rows = await db.select().from(s.docWatch);
    expect(rows.filter((w) => w.lastCheckedAt)).toHaveLength(9);
    const events = await db.select().from(s.agentEvents).where(eq(s.agentEvents.agent, "vigia"));
    expect(events.some((e) => e.action === "radar_verificado")).toBe(true);
  });

  it("same: nada muda, nenhum alerta", async () => {
    const { scraper } = fakeFirecrawl("same", { "debito.html": ["1.0", "1.3"] });
    const r = await checkDocs({ db, scraper, env, sleep });
    expect(r.changed).toBe(0);
    expect(await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.kind, "alerta_radar"))).toHaveLength(0);
  });

  it("changed: grava o diff, audita, alerta ALERT_EMAIL (simulado sem RESEND_API_KEY) e marca código desatualizado", async () => {
    const { scraper } = fakeFirecrawl("changed", { "debito.html": ["1.0", "1.3", "1.4"] }, "- versão 1.3\n+ versão 1.4");
    const r = await checkDocs({ db, scraper, env, sleep });
    const deb = r.pages.find((p) => p.url.endsWith("debito.html"))!;
    expect(deb).toMatchObject({ firecrawl: "changed", previousVersion: "1.3", version: "1.4", changed: true, codeOutdated: true, alerted: true });
    const [row] = await db.select().from(s.docWatch).where(eq(s.docWatch.url, deb.url));
    expect(row).toMatchObject({ changeStatus: "alertado", lastVersion: "1.4", diffText: "- versão 1.3\n+ versão 1.4" });
    const alerts = await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.kind, "alerta_radar"));
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts.find((a) => a.refId === row.id)).toMatchObject({ lastStatus: "simulado", toLabel: "t•••@k•••.exemplo", body: "Contrato da Receita mudou: Débitos 1.3 → 1.4" });
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "radar.alerta"));
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("changed com RESEND_API_KEY: POST /emails com Idempotency-Key, sem expor a chave no corpo", async () => {
    await db.update(s.docWatch).set({ lastVersion: "1.3" }).where(eq(s.docWatch.url, `${RECEITA_DOCS_BASE}debito.html`));
    const sent: { headers: Record<string, string>; body: string }[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { scraper } = fakeFirecrawl("changed", { "debito.html": ["1.0", "1.5"] }, "+ 1.5");
    await checkDocs({ db, scraper, env: { ...env, RESEND_API_KEY: "re_teste", RESEND_FROM: "vigia@kingyoube.exemplo" }, sleep, fetch: fakeFetch });
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0].headers["Idempotency-Key"]).toMatch(/^radar-/);
    expect(sent[0].body).not.toContain("re_teste");
  });

  it("URL fora da lista fechada é recusada sem chamar o Firecrawl", async () => {
    const { scraper, calls } = fakeFirecrawl("new", {});
    await expect(guardedScrape(scraper, "https://exemplo.com/qualquer", {}, env)).rejects.toBeInstanceOf(ScrapeNotAllowedError);
    await expect(guardedScrape(scraper, "https://hack.exemplo/demo/fornecedores/../admin", {}, { APP_URL: "https://hack.exemplo" })).rejects.toBeInstanceOf(ScrapeNotAllowedError);
    expect(calls).toHaveLength(0);
    expect(isAllowedUrl("https://hack.exemplo/demo/fornecedores/moinho-estrela", { APP_URL: "https://hack.exemplo" })).toBe(true);
    expect(isAllowedUrl(`${RECEITA_DOCS_BASE}debito.html`, {})).toBe(true);
  });
});

describe("Vigia: alerta que falhou", () => {
  it("Resend recusa → fica 'mudou'; próxima leitura sem mudança tenta de novo e marca 'alertado'", async () => {
    const url = `${RECEITA_DOCS_BASE}debito.html`;
    await db.update(s.docWatch).set({ lastVersion: "1.5", changeStatus: "sem_mudanca" }).where(eq(s.docWatch.url, url));
    const resend = { ...env, RESEND_API_KEY: "re_teste", RESEND_FROM: "vigia@kingyoube.exemplo" };
    const failing = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await checkDocs({ db, scraper: fakeFirecrawl("changed", { "debito.html": ["1.6"] }, "+ 1.6").scraper, env: resend, sleep, fetch: failing });
    let [row] = await db.select().from(s.docWatch).where(eq(s.docWatch.url, url));
    expect(row).toMatchObject({ changeStatus: "mudou", lastVersion: "1.6", diffText: "+ 1.6" });
    const ok = (async () => new Response(JSON.stringify({ id: "email_retry" }), { status: 200 })) as unknown as typeof fetch;
    await checkDocs({ db, scraper: fakeFirecrawl("same", { "debito.html": ["1.6"] }).scraper, env: resend, sleep, fetch: ok });
    [row] = await db.select().from(s.docWatch).where(eq(s.docWatch.url, url));
    expect(row.changeStatus).toBe("alertado");
  });
});
