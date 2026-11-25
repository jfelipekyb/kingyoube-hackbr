import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { buildDemoData } from "@/seed/demo-data";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { createReceitaAdapter } from "./adapter";
import { normalizeFile } from "./normalize";
import { brasiliaDayBounds, pollRequests, processRequest, syncCompany, syncOverview, windowRisk, type ApuracaoDeps } from "./sync";
import { RECEITA_SERVICES, ReceitaError, type ReceitaAdapter } from "./types";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

const DEMO_TODAY = "2026-11-20";
const data = buildDemoData(DEMO_TODAY);
const padaria = data.companies.find((c) => c.slug === "padaria-boa-massa")!;
const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY };

const n = async (table: typeof s.rfbDebits | typeof s.rfbCredits | typeof s.rfbPayments, companyId = padaria.id) => {
  const [row] = await db.select({ n: count() }).from(table).where(eq(table.companyId, companyId));
  return Number(row.n);
};

describe("Agente Apuração em SIMULADO", () => {
  beforeEach(async () => {
    await seedDemo(db, { demoToday: DEMO_TODAY });
  });

  it("Sincronizar a Padaria leva os 4 serviços a normalizada em < 15 s e popula as tabelas (docs/06)", async () => {
    const start = new Date("2026-11-25T15:00:00Z").getTime();
    const clock = { t: start };
    const now = () => new Date(clock.t);
    const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };

    const opened = await syncCompany(deps, padaria.id);
    expect(opened.results.map((r) => r.status)).toEqual(["aberta", "aberta", "aberta", "aberta"]);

    const states: string[][] = [];
    while (clock.t - start <= 15_000) {
      await pollRequests(deps, { companyId: padaria.id });
      const ov = await syncOverview(db, { companyId: padaria.id, env, now: now() });
      states.push(ov.companies[0].services.map((x) => x.state!));
      if (ov.open === 0) break;
      clock.t += 2_000; // polling da tela
    }
    expect(clock.t - start).toBeLessThan(15_000);
    expect(states.at(-1)).toEqual(["normalizada", "normalizada", "normalizada", "normalizada"]);
    expect(states.flat()).toContain("solicitada");
    expect(states.flat()).toContain("em_processamento");

    const debits = data.debits.filter((d) => d.companySlug === padaria.slug);
    const credits = data.credits.filter((c) => c.companySlug === padaria.slug);
    expect(await n(s.rfbDebits)).toBe(debits.length);
    expect(await n(s.rfbCredits)).toBe(credits.length);
    expect(await n(s.rfbPayments)).toBe(2); // PCONT do V1 + RAD do C5

    const scenario = (list: { scenario: string | null; accessKey: string }[], id: string) => list.find((x) => x.scenario === id)!.accessKey;
    const [v2] = await db.select().from(s.rfbDebits).where(eq(s.rfbDebits.accessKey, scenario(debits, "V2")));
    expect(v2).toMatchObject({ apuradoCents: 13200n, saldoDevedorCents: 13200n });
    const [v5] = await db.select().from(s.rfbDebits).where(eq(s.rfbDebits.accessKey, scenario(debits, "V5")));
    expect(v5.apuradoCents).toBe(7500n);
    const [v6] = await db.select().from(s.rfbDebits).where(eq(s.rfbDebits.accessKey, scenario(debits, "V6")));
    expect(v6).toMatchObject({ apuradoCents: 20000n, suspensoCents: 2000n, saldoDevedorCents: 18000n });
    const [c2] = await db.select().from(s.rfbCredits).where(eq(s.rfbCredits.accessKey, scenario(credits, "C2")));
    expect(c2).toMatchObject({ apuradoCents: 43650n, aApropriarCents: 43650n, saldoCredorCents: 0n });
    const [c4] = await db.select().from(s.rfbCredits).where(eq(s.rfbCredits.accessKey, scenario(credits, "C4")));
    expect(c4.inapropriavelCents).toBe(9000n);
    const [c5] = await db.select().from(s.rfbPayments).where(eq(s.rfbPayments.sourceService, "recolhimentos"));
    expect(c5).toMatchObject({ type: 1, principalCents: 10000n, multaCents: 1000n, jurosCents: 500n, totalCents: 11500n });
    const [v1] = await db.select().from(s.rfbPayments).where(eq(s.rfbPayments.sourceService, "pagamentos"));
    expect(v1).toMatchObject({ type: 2, totalCents: 9000n });

    const raws = await db.select().from(s.rfbRawFiles);
    expect(raws).toHaveLength(4);
    expect(raws.every((r) => /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
    // niConsumidor pode ser CPF (docs/07): só hash com sal + 2 últimos dígitos.
    for (const r of raws) expect((r.payload as { niConsumidor: string }).niConsumidor).toMatch(new RegExp(`^h:[0-9a-f]{64}:${padaria.cnpj.slice(-2)}$`));

    // Toda etapa gravou agent_event do agente apuracao.
    const events = await db.select().from(s.agentEvents).where(eq(s.agentEvents.agent, "apuracao"));
    const actions = new Set(events.map((e) => e.action));
    for (const a of ["solicitar", "acompanhar", "baixar", "normalizar"]) expect(actions).toContain(a);
    const done = events.filter((e) => e.action === "normalizar");
    expect(done).toHaveLength(4);
    expect(done.every((e) => e.status === "feito" && e.minutesSaved === 10)).toBe(true);
    expect(done.find((e) => e.summary.includes("débitos"))!.count).toBe(debits.length);
  });

  it("mesmo arquivo processado 2× não duplica linha", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 15) };
    const adapter = createReceitaAdapter(db, env, { now: () => new Date(clock.t) });
    for (const service of RECEITA_SERVICES) {
      const { ticket } = await adapter.requestConsulta(padaria.id, service);
      clock.t += 6_000;
      const { raw } = await adapter.download(ticket);
      const input = { companyId: padaria.id, cnpjRoot: padaria.cnpjRoot, service, raw };
      const first = await normalizeFile(db, input);
      const second = await normalizeFile(db, input);
      expect(second.inserted).toBe(0);
      expect(second.rows).toBe(first.rows);
    }
    expect(await n(s.rfbDebits)).toBe(data.debits.filter((d) => d.companySlug === padaria.slug).length);
    expect(await n(s.rfbPayments)).toBe(2);
  });

  it("polling concorrente do mesmo pedido grava o bruto uma vez só", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 15) };
    const now = () => new Date(clock.t);
    const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };
    await syncCompany(deps, padaria.id, ["debitos"]);
    clock.t += 6_000;
    await pollRequests(deps);
    const [req] = await db.select().from(s.rfbRequests);
    expect(req.state).toBe("normalizada");
    await db.update(s.rfbRequests).set({ state: "concluida" });
    await Promise.all([processRequest(deps, req.id), processRequest(deps, req.id)]);
    expect(await db.select().from(s.rfbRawFiles)).toHaveLength(1);
  });

  it("arquivo com atualizacao mais antiga não sobrescreve; mais nova atualiza", async () => {
    const adapter = createReceitaAdapter(db, env, { now: () => new Date(Date.UTC(2026, 10, 25, 15)) });
    const { ticket } = await adapter.requestConsulta(padaria.id, "debitos");
    const later = createReceitaAdapter(db, env, { now: () => new Date(Date.UTC(2026, 10, 25, 16)) });
    const { raw } = await later.download(ticket);
    const key = data.debits.find((d) => d.scenario === "V2")!.accessKey;
    const base = { companyId: padaria.id, cnpjRoot: padaria.cnpjRoot, service: "debitos" as const };
    await normalizeFile(db, { ...base, raw });
    const block = (r: string) => r.slice(r.indexOf(key));
    const older = raw.replace(block(raw), block(raw).replace('"saldoDevedor": 132.00', '"saldoDevedor": 1.00').replace(/"atualizacao": "[^"]+"/, '"atualizacao": "2026-01-01T00:00:00Z"'));
    await normalizeFile(db, { ...base, raw: older });
    const get = async () => (await db.select().from(s.rfbDebits).where(eq(s.rfbDebits.accessKey, key)))[0];
    expect((await get()).saldoDevedorCents).toBe(13200n);
    const newer = raw.replace(block(raw), block(raw).replace('"saldoDevedor": 132.00', '"saldoDevedor": 2.00').replace(/"atualizacao": "[^"]+"/, '"atualizacao": "2026-12-01T00:00:00-03:00"'));
    await normalizeFile(db, { ...base, raw: newer });
    expect((await get()).saldoDevedorCents).toBe(200n);
  });

  it("5ª chamada do dia no mesmo serviço e cliente é recusada sem chamar o adaptador (falha conta)", async () => {
    const requestConsulta = vi.fn(async () => {
      throw new ReceitaError("ERRO_INTERNO", "falhou", 500);
    });
    const adapter: ReceitaAdapter = {
      mode: "SIMULADO",
      requestConsulta,
      getSituacao: vi.fn(),
      download: vi.fn(),
      gerarDarfRad: vi.fn(),
    };
    const now = () => new Date("2026-11-25T23:30:00-03:00");
    const deps: ApuracaoDeps = { db, adapter, env, now };
    for (let i = 0; i < 4; i++) {
      const r = await syncCompany(deps, padaria.id, ["debitos"]);
      expect(r.results[0].status).toBe("erro");
    }
    expect(requestConsulta).toHaveBeenCalledTimes(4);
    const fifth = await syncCompany(deps, padaria.id, ["debitos"]);
    expect(fifth.results[0]).toMatchObject({ status: "cota_esgotada", used: 4, limit: 4 });
    expect(requestConsulta).toHaveBeenCalledTimes(4);

    // Outro serviço e outro cliente têm cota própria.
    await syncCompany(deps, padaria.id, ["creditos"]);
    await syncCompany(deps, data.companies[1].id, ["debitos"]);
    expect(requestConsulta).toHaveBeenCalledTimes(6);

    // Dia novo de Brasília (00:00 -03:00 = 03:00 UTC) zera a cota.
    const nextDay: ApuracaoDeps = { ...deps, now: () => new Date("2026-11-26T00:00:01-03:00") };
    await syncCompany(nextDay, padaria.id, ["debitos"]);
    expect(requestConsulta).toHaveBeenCalledTimes(7);

    const blocked = await db
      .select()
      .from(s.agentEvents)
      .where(and(eq(s.agentEvents.agent, "apuracao"), eq(s.agentEvents.action, "cota_esgotada")));
    expect(blocked).toHaveLength(1);
    expect(blocked[0].summary).toContain("Não chamei a Receita");
    const ov = await syncOverview(db, { companyId: padaria.id, env, now: now() });
    expect(ov.companies[0].services[0]).toMatchObject({ quotaUsed: 4, quotaLimit: 4 });
  });

  it("RFB_DAILY_LIMIT muda a cota", async () => {
    const requestConsulta = vi.fn(async () => ({ ticket: "x", etaSeconds: 5 }));
    const adapter = { mode: "SIMULADO" as const, requestConsulta, getSituacao: vi.fn(), download: vi.fn(), gerarDarfRad: vi.fn() };
    const deps: ApuracaoDeps = { db, adapter, env: { ...env, RFB_DAILY_LIMIT: "1" }, now: () => new Date("2026-11-25T12:00:00Z") };
    expect((await syncCompany(deps, padaria.id, ["pagamentos"])).results[0].status).toBe("aberta");
    await db.update(s.rfbRequests).set({ state: "erro" });
    expect((await syncCompany(deps, padaria.id, ["pagamentos"])).results[0].status).toBe("cota_esgotada");
    expect(requestConsulta).toHaveBeenCalledTimes(1);
  });

  it("não abre segunda consulta enquanto a primeira está em aberto (não gasta cota)", async () => {
    const now = () => new Date("2026-11-25T12:00:00Z");
    const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };
    await syncCompany(deps, padaria.id, ["debitos"]);
    const again = await syncCompany(deps, padaria.id, ["debitos"]);
    expect(again.results[0].status).toBe("em_andamento");
    const [row] = await db.select({ n: count() }).from(s.rfbRequests);
    expect(Number(row.n)).toBe(1);
  });

  it("expira depois de 240 minutos", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 12) };
    const adapter: ReceitaAdapter = {
      mode: "SIMULADO",
      requestConsulta: async () => ({ ticket: "T", etaSeconds: -1 }),
      getSituacao: async () => ({ situacao: "PENDENTE" }),
      download: vi.fn(),
      gerarDarfRad: vi.fn(),
    };
    const deps: ApuracaoDeps = { db, adapter, env, now: () => new Date(clock.t) };
    const { results } = await syncCompany(deps, padaria.id, ["debitos"]);
    const id = (results[0] as { requestId: string }).requestId;
    clock.t += 241 * 60_000;
    expect(await processRequest(deps, id)).toBe("expirada");
  });
});

describe("regras de data", () => {
  it("dia de Brasília vai de 03:00 UTC a 03:00 UTC", () => {
    const b = brasiliaDayBounds(new Date("2026-11-26T02:59:00Z"));
    expect(b.day).toBe("2026-11-25");
    expect(b.start.toISOString()).toBe("2026-11-25T03:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-11-26T03:00:00.000Z");
  });

  it("janela em risco a partir do 6º dia sem sincronização concluída", () => {
    const now = new Date("2026-11-25T12:00:00-03:00");
    expect(windowRisk(null, now)).toEqual({ days: null, atRisk: false });
    expect(windowRisk(new Date("2026-11-20T23:00:00-03:00"), now)).toEqual({ days: 5, atRisk: false });
    expect(windowRisk(new Date("2026-11-19T08:00:00-03:00"), now)).toEqual({ days: 6, atRisk: true });
  });
});
