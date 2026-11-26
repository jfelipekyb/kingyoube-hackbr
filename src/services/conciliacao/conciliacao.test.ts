import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { portfolioMetrics, portfolioTotals, radCandidates } from "@/services/carteira/metrics";
import { explain, sameNumbers, templateExplanation, type ExplanationFacts } from "@/services/explicacao";
import { createReceitaAdapter, pollRequests, syncPortfolio, type ApuracaoDeps } from "@/services/receita";
import { buildDemoData } from "@/seed/demo-data";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { reconcile, reconcilePortfolio, type ConciliacaoDeps } from "./index";
import { itemDetail } from "./queries";

let db: Db;
let close: () => Promise<void>;
const DEMO_TODAY = "2026-11-20";
const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY };
const data = buildDemoData(DEMO_TODAY);
const bySlug = (slug: string) => data.companies.find((c) => c.slug === slug)!;
const padaria = bySlug("padaria-boa-massa");
const rota9 = bySlug("auto-pecas-rota-9");
const keyOf = (scenario: string) => data.invoices.find((i) => i.scenario === scenario)?.accessKey ?? data.debits.find((d) => d.scenario === scenario)!.accessKey;

async function syncAll() {
  const clock = { t: Date.UTC(2026, 10, 25, 15) };
  const now = () => new Date(clock.t);
  const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };
  await syncPortfolio(deps);
  for (let i = 0; i < 20; i++) {
    clock.t += 2_000;
    await pollRequests(deps);
  }
  return now();
}

let deps: ConciliacaoDeps;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: DEMO_TODAY });
  const now = await syncAll();
  deps = { db, env, now, rewriter: null };
  await reconcilePortfolio(deps);
}, 120_000);
afterAll(() => close());

const statusOf = async (companyId?: string) => {
  const rows = await db
    .select({ status: s.reconciliationItems.status, n: count() })
    .from(s.reconciliationItems)
    .where(companyId ? eq(s.reconciliationItems.companyId, companyId) : undefined)
    .groupBy(s.reconciliationItems.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
};

describe("Conciliador sobre o seed (docs/06, tabela Por status)", () => {
  it("Padaria, Rota 9, demais e carteira batem exatamente", async () => {
    expect(await statusOf(padaria.id)).toEqual({ conciliado: 44, atencao: 2, divergente_valor: 1, aguardando_janela: 1, so_na_nota: 2, so_na_receita: 1 });
    expect(await statusOf(rota9.id)).toEqual({ conciliado: 31, so_na_nota: 1 });
    const others = data.companies.filter((c) => c.id !== padaria.id && c.id !== rota9.id).map((c) => c.id);
    expect(others).toHaveLength(10);
    const [o] = await db.select({ n: count() }).from(s.reconciliationItems).where(inArray(s.reconciliationItems.companyId, others));
    const [oc] = await db
      .select({ n: count() })
      .from(s.reconciliationItems)
      .where(and(inArray(s.reconciliationItems.companyId, others), eq(s.reconciliationItems.status, "conciliado")));
    expect([Number(o.n), Number(oc.n)]).toEqual([330, 330]);
    expect(await statusOf()).toEqual({ conciliado: 405, atencao: 2, divergente_valor: 1, aguardando_janela: 1, so_na_nota: 3, so_na_receita: 1 });
  });

  it("cada cenário à mão cai na regra certa, com rule_id e contract_version", async () => {
    const expected: Record<string, string> = { V1: "R01", V2: "R02", V3: "R03", V4: "R04", V5: "R05", V6: "R06", C1: "R01", C2: "R01", C3: "R01", C4: "R06", C5: "R01", C6: "R04", R9: "R04" };
    for (const [scenario, rule] of Object.entries(expected)) {
      const [item] = await db.select().from(s.reconciliationItems).where(eq(s.reconciliationItems.accessKey, keyOf(scenario)));
      expect(item.ruleId, scenario).toBe(rule);
      expect(item.contractVersion).toBe("1.3");
      expect(item.explanation).toBe(item.explanationOriginal);
    }
    const [v2] = await db.select().from(s.reconciliationItems).where(eq(s.reconciliationItems.accessKey, keyOf("V2")));
    expect(v2).toMatchObject({ invoiceCents: 12000n, rfbCents: 13200n, diffCents: 1200n });
    expect(v2.explanation).toContain("Diferença de R$ 12,00 a maior na Receita");
  });

  it("indicadores da carteira (docs/06, tabela Carteira) e ordem por dinheiro em risco", async () => {
    const rows = await portfolioMetrics(db);
    expect(rows[0]).toMatchObject({ name: padaria.name, riskCents: 143850n, lockedCents: 123650n, decisions: 3 });
    expect(rows[1]).toMatchObject({ name: rota9.name, riskCents: 8100n, lockedCents: 0n, decisions: 0 });
    for (const r of rows.slice(2)) expect([r.riskCents, r.lockedCents, r.decisions]).toEqual([0n, 0n, 0]);
    expect(portfolioTotals(rows)).toMatchObject({ riskCents: 151950n, lockedCents: 123650n, decisions: 3, items: 413 });
  });

  it("candidatas a RAD: só C2 e C3, com o valor sugerido = aApropriar", async () => {
    const c = await radCandidates(db);
    expect(c.map((x) => [x.accessKey, x.lockedCents])).toEqual([
      [keyOf("C3"), 80000n],
      [keyOf("C2"), 43650n],
    ]);
  });

  it("detalhe da compra C1 mostra o CBS apropriado e o utilizado (R$ 150,00)", async () => {
    const [item] = await db.select({ id: s.reconciliationItems.id }).from(s.reconciliationItems).where(eq(s.reconciliationItems.accessKey, keyOf("C1")));
    const detail = await itemDetail(db, item.id);
    const fields = new Map((detail?.receita ?? []).flatMap((r) => r.fields));
    expect(fields.get("Apropriado")).toBe(15000n);
    expect(fields.get("Utilizado")).toBe(15000n);
  });

  it("recalcular não duplica itens nem muda números", async () => {
    const before = await db.select().from(s.reconciliationItems);
    await reconcilePortfolio(deps);
    await reconcile(deps, padaria.id);
    await reconcile(deps, padaria.id, data.invoices.find((i) => i.scenario === "V2")!.period);
    const after = await db.select().from(s.reconciliationItems);
    expect(after).toHaveLength(413);
    const pick = (r: (typeof before)[number]) => [r.accessKey, r.period, r.kind, r.status, r.ruleId, r.diffCents];
    expect(after.map(pick).sort()).toEqual(before.map(pick).sort());
  });

  it("conciliador e analista registram agent_events (docs/09)", async () => {
    const events = await db.select().from(s.agentEvents).where(inArray(s.agentEvents.agent, ["conciliador", "analista"]));
    const portfolio = events.filter((e) => e.entity === "carteira");
    expect(portfolio.find((e) => e.agent === "conciliador")?.summary).toBe("Conciliei 413 itens: 405 conciliados, 8 pedem olhar.");
    expect(portfolio.find((e) => e.agent === "analista")?.summary).toBe("Expliquei 8 itens.");
    expect(portfolio.find((e) => e.agent === "conciliador")?.minutesSaved).toBe(413 * 3);
  });
});

describe("Analista: a LLM nunca muda número", () => {
  const facts: ExplanationFacts = {
    ruleId: "R02",
    kind: "debito",
    period: "10/2026",
    invoiceCents: 12000n,
    rfbCents: 13200n,
    diffCents: 1200n,
    issuedOn: "2026-10-30",
    referenceDay: "2026-11-20",
    daysSinceIssue: 21,
    blocked: [],
    otherOrigin: false,
  };

  it("modelo fixo do R02 é o de docs/04", () => {
    expect(templateExplanation(facts)).toBe(
      "A nota informa CBS de R$ 120,00. A Receita apurou R$ 132,00 para a mesma chave no período 10/2026. Diferença de R$ 12,00 a maior na Receita. Verifique a classificação tributária dos itens da nota.",
    );
  });

  it("reescrita com os mesmos números vale; com número trocado, fica o original", async () => {
    const original = templateExplanation(facts);
    const good = await explain(facts, async () => "A nota traz R$ 120,00 de CBS, mas a Receita apurou R$ 132,00 na mesma chave em 10/2026: R$ 12,00 a mais na Receita. Revise a classificação dos itens.");
    expect(good).toMatchObject({ rewritten: true, original });
    const bad = await explain(facts, async () => "A Receita apurou R$ 133,00, a nota R$ 120,00, diferença de R$ 13,00 em 10/2026.");
    expect(bad).toEqual({ explanation: original, original, rewritten: false });
    expect(sameNumbers("R$ 1,00 e 2", "R$ 1,00 e 2")).toBe(true);
  });

  it("reescrita que troca a ordem dos valores ou o sinal fica com o original", async () => {
    const original = templateExplanation(facts);
    const swapped = await explain(facts, async () => "A nota informa CBS de R$ 132,00. A Receita apurou R$ 120,00 para a mesma chave no período 10/2026. Diferença de R$ 12,00 a maior na Receita.");
    expect(swapped).toEqual({ explanation: original, original, rewritten: false });
    expect(sameNumbers("R$ 1,00 e 2", "2 e R$ 1,00")).toBe(false);
    expect(sameNumbers("Diferença de -R$ 12,00", "Diferença de R$ 12,00")).toBe(false);
    expect(sameNumbers("Diferença de -R$ 12,00", "Diferença de R$ -12,00")).toBe(true);
  });
});
