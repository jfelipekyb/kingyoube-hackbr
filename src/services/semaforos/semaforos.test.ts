import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { createReceitaAdapter, pollRequests, syncPortfolio, type ApuracaoDeps } from "@/services/receita";
import { buildDemoData, FORNO_FORTE_SLUG, MOINHO_SLUG } from "@/seed/demo-data";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { countByLight, customerLight, customerLights, supplierLight, supplierLights } from "./index";

describe("supplierLight — cada linha da tabela 1 de docs/11", () => {
  const paid = { aApropriarCents: 0n, confirmedRadCents: 0n };
  const open = { aApropriarCents: 43650n, confirmedRadCents: 0n };
  const viaRad = { aApropriarCents: 10000n, confirmedRadCents: 10000n };

  it("verde: todas as compras com crédito apropriado", () => {
    for (const radAgreement of ["aceita", "recusa", "sem_resposta"] as const) {
      expect(supplierLight({ radAgreement, purchases: [paid, paid] })).toEqual({ light: "verde", regularizedByRad: false });
    }
  });
  it("verde: regularizado por RAD já confirmado (com selo)", () => {
    expect(supplierLight({ radAgreement: "sem_resposta", purchases: [paid, viaRad] })).toEqual({ light: "verde", regularizedByRad: true });
  });
  it("amarelo: não recolheu e aceita o RAD", () => {
    expect(supplierLight({ radAgreement: "aceita", purchases: [paid, open] }).light).toBe("amarelo");
  });
  it("amarelo: não recolheu e ainda não respondeu", () => {
    expect(supplierLight({ radAgreement: "sem_resposta", purchases: [open] }).light).toBe("amarelo");
    expect(supplierLight({ radAgreement: "sem_resposta", purchases: [{ aApropriarCents: 10000n, confirmedRadCents: 4000n }] }).light).toBe("amarelo");
  });
  it("vermelho: não recolheu e recusou o RAD", () => {
    expect(supplierLight({ radAgreement: "recusa", purchases: [open] }).light).toBe("vermelho");
  });
});

describe("customerLight — cada linha da tabela 2 de docs/11", () => {
  it("verde: cliente pagou, ou CBS extinta/sem saldo devedor", () => {
    expect(customerLight({ receipt: "recebido", saldoDevedorCents: 0n })).toBe("verde");
    expect(customerLight({ receipt: "recebido", saldoDevedorCents: 9000n })).toBe("verde");
    expect(customerLight({ receipt: "a_receber", saldoDevedorCents: 0n })).toBe("verde");
    expect(customerLight({ receipt: "vencido", saldoDevedorCents: 0n })).toBe("verde");
  });
  it("amarelo: a receber, no prazo, com saldo devedor > 0", () => {
    expect(customerLight({ receipt: "a_receber", saldoDevedorCents: 13200n })).toBe("amarelo");
  });
  it("vermelho: vencido com CBS em aberto", () => {
    expect(customerLight({ receipt: "vencido", saldoDevedorCents: 18000n })).toBe("vermelho");
  });
});

describe("semáforos sobre o seed (docs/11)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const DEMO_TODAY = "2026-11-20";
  const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY };
  const data = buildDemoData(DEMO_TODAY);
  const padaria = data.companies.find((c) => c.slug === "padaria-boa-massa")!;
  const cp = (slug: string) => data.counterparties.find((c) => c.slug === slug)!;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await seedDemo(db, { demoToday: DEMO_TODAY });
    const clock = { t: Date.UTC(2026, 10, 25, 15) };
    const now = () => new Date(clock.t);
    const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };
    await syncPortfolio(deps);
    for (let i = 0; i < 20; i++) {
      clock.t += 2_000;
      await pollRequests(deps);
    }
  }, 120_000);
  afterAll(() => close());

  it("Padaria: Forno Forte vermelho, Moinho Estrela amarelo, fornecedor da C5 verde com RAD, demais verdes", async () => {
    const rows = await supplierLights(db, padaria.id);
    expect(countByLight(rows)).toMatchObject({ vermelho: 1, amarelo: 1 });
    expect(rows.find((r) => r.counterpartyId === cp(FORNO_FORTE_SLUG).id)).toMatchObject({ light: "vermelho", radAgreement: "recusa" });
    expect(rows.find((r) => r.counterpartyId === cp(MOINHO_SLUG).id)).toMatchObject({ light: "amarelo", radAgreement: "sem_resposta" });
    const c5 = data.invoices.find((i) => i.scenario === "C5")!;
    expect(rows.find((r) => r.cnpj === c5.counterpartyCnpj)).toMatchObject({ light: "verde", regularizedByRad: true });
    expect(rows.filter((r) => r.light === "verde")).toHaveLength(rows.length - 2);
  });

  it("Padaria: V6 vermelha, V2 amarela, demais vendas verdes", async () => {
    const rows = await customerLights(db, padaria.id);
    const key = (s: string) => data.invoices.find((i) => i.scenario === s)!.accessKey;
    expect(countByLight(rows)).toEqual({ vermelho: 1, amarelo: 1, verde: rows.length - 2 });
    expect(rows.find((r) => r.accessKey === key("V6"))).toMatchObject({ light: "vermelho", receipt: "vencido" });
    expect(rows.find((r) => r.accessKey === key("V2"))).toMatchObject({ light: "amarelo", receipt: "a_receber" });
  });

  it("demais clientes: tudo verde", async () => {
    for (const c of data.companies.filter((x) => x.id !== padaria.id)) {
      expect(countByLight(await supplierLights(db, c.id))).toMatchObject({ vermelho: 0, amarelo: 0 });
      expect(countByLight(await customerLights(db, c.id))).toMatchObject({ vermelho: 0, amarelo: 0 });
    }
  });
});
