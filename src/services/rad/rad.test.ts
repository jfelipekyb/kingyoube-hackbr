import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { ReceitaAdapter } from "@/services/receita";
import { ANALISTA, CONTADOR, invoiceOf, other, padaria, syncedDb } from "@/test/rad-fixture";
import { approveProposal, generateDarf, prepareProposal, RAD_ERROR_MESSAGE, RadError, rejectProposal, submitProposal, updateDraft } from "./index";

let db: Db;
let close: () => Promise<void>;
let adapter: ReceitaAdapter;
beforeAll(async () => {
  const f = await syncedDb();
  ({ db, close } = f);
  adapter = f.deps.adapter;
}, 120_000);
afterAll(() => close());

const fails = async (p: Promise<unknown>, status: number, code?: string) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(RadError);
  expect((e as RadError).status).toBe(status);
  if (code) expect((e as RadError).code).toBe(code);
};

const ctx = (id: string, actor: string, companyId: string | null = padaria.id) => ({ id, companyId, actor });

describe("máquina de estados e travas do RAD (docs/02, docs/11)", () => {
  it("C2: preparado pela Tesouraria → enviado pelo Analista → aprovado pelo contador → DARF", async () => {
    const p = await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C2").id, requestedBy: ANALISTA });
    expect(p).toMatchObject({ state: "rascunho", preparedBy: "agente:tesouraria", option: "PAGAMENTO_TOTAL" });
    expect((await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C2").id, requestedBy: ANALISTA })).id).toBe(p.id);

    await fails(submitProposal(db, ctx(p.id, "agente:analista")), 403, "SOMENTE_PESSOA");
    expect(await submitProposal(db, ctx(p.id, ANALISTA))).toMatchObject({ state: "aguardando_aprovacao", submittedBy: ANALISTA });

    await fails(approveProposal(db, ctx(p.id, "agente:tesouraria")), 403, "SOMENTE_PESSOA");
    await fails(approveProposal(db, ctx(p.id, ANALISTA)), 403, "SOMENTE_CONTADOR");
    await fails(approveProposal(db, ctx(p.id, CONTADOR, other.id)), 403, "OUTRA_EMPRESA");
    await fails(generateDarf({ db, adapter }, ctx(p.id, CONTADOR)), 409, "ESTADO_INVALIDO");

    expect(await approveProposal(db, ctx(p.id, CONTADOR))).toMatchObject({ state: "aprovada", approvedBy: CONTADOR, awareOfRefusal: false });
    await fails(generateDarf({ db, adapter }, ctx(p.id, ANALISTA)), 403, "SOMENTE_CONTADOR");
    await fails(generateDarf({ db, adapter }, ctx(p.id, "agente:tesouraria")), 403, "SOMENTE_PESSOA");

    const d = await generateDarf({ db, adapter }, ctx(p.id, CONTADOR));
    expect(d).toMatchObject({ state: "darf_gerado", principalCents: 43650n, totalCents: 43650n, dueDate: "2026-11-30", rfbReturnCode: "DARF_GERADO" });
    expect(d.darfPix).toBeTruthy();
    expect(d.darfBarcode).toMatch(/^\d{44}$/);
    expect(d.darfPdfUrl).toMatch(/^\/demo\/darf\//);
    const events = await db.select().from(s.agentEvents).where(and(eq(s.agentEvents.entityId, p.id), eq(s.agentEvents.agent, "tesouraria")));
    expect(events.map((e) => e.action).sort()).toEqual(["darf_gerado", "preparou_rad"]);
    const denied = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, p.id), eq(s.auditLog.result, "negado")));
    expect(denied.length).toBeGreaterThanOrEqual(5);
  });

  it("quem envia não aprova nem recusa", async () => {
    const [row] = await db
      .insert(s.radProposals)
      .values({ companyId: padaria.id, invoiceId: invoiceOf("C2").id, accessKey: invoiceOf("C2").accessKey, option: "PAGAMENTO_TOTAL", justification: "x", preparedBy: "agente:tesouraria", state: "recusada" })
      .returning();
    await db.update(s.radProposals).set({ state: "rascunho" }).where(eq(s.radProposals.id, row.id));
    await submitProposal(db, ctx(row.id, CONTADOR));
    await fails(approveProposal(db, ctx(row.id, CONTADOR)), 403, "MESMA_PESSOA");
    await fails(rejectProposal(db, { ...ctx(row.id, CONTADOR), reason: "não" }), 403, "MESMA_PESSOA");
    await db.update(s.radProposals).set({ state: "recusada" }).where(eq(s.radProposals.id, row.id));
  });

  it("C3 (Forno Forte vermelho): aprovar sem 'ciente' dá 409; parcial acima do DFE vira erro da Receita em português", async () => {
    const p = await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C3").id, requestedBy: ANALISTA });
    await updateDraft(db, { ...ctx(p.id, ANALISTA), option: "PAGAMENTO_PARCIAL", partialCents: 90000n, justification: "Parcial negociado" });
    await submitProposal(db, ctx(p.id, ANALISTA));
    await fails(approveProposal(db, ctx(p.id, CONTADOR)), 409, "CIENTE_OBRIGATORIO");
    await fails(approveProposal(db, { ...ctx(p.id, CONTADOR), awareOfRefusal: false }), 409, "CIENTE_OBRIGATORIO");
    expect(await approveProposal(db, { ...ctx(p.id, CONTADOR), awareOfRefusal: true })).toMatchObject({ state: "aprovada", awareOfRefusal: true });
    const e = await generateDarf({ db, adapter }, ctx(p.id, CONTADOR));
    expect(e).toMatchObject({ state: "erro_receita", rfbReturnCode: "VALOR_PARCIAL_SUPERIOR_DFE", rfbMessage: RAD_ERROR_MESSAGE.VALOR_PARCIAL_SUPERIOR_DFE, darfPix: null });
    expect(await updateDraft(db, { ...ctx(p.id, ANALISTA), option: "PAGAMENTO_PARCIAL", partialCents: 40000n, justification: "Parcial corrigido" })).toMatchObject({ state: "rascunho", rfbReturnCode: null });
  });
});

describe("gerarDarfRad SIMULADO: os quatro erros (docs/03 §7)", () => {
  it("DFE_NAO_ENCONTRADO, VALOR_PARCIAL_SUPERIOR_DFE, CNPJ_NAO_ADQUIRENTE e DADOS_DE_ENTRADA_INVALIDOS", async () => {
    const c2 = invoiceOf("C2");
    const sale = (await db.select().from(s.invoices).where(and(eq(s.invoices.companyId, padaria.id), eq(s.invoices.direction, "venda"))))[0];
    expect((await adapter.gerarDarfRad(padaria.id, [{ chaveDFE: "0".repeat(44), opcaoPagamento: "PAGAMENTO_TOTAL" }])).cdRetorno).toBe("DFE_NAO_ENCONTRADO");
    expect((await adapter.gerarDarfRad(padaria.id, [{ chaveDFE: c2.accessKey, opcaoPagamento: "PAGAMENTO_PARCIAL", valorDarfParcialCents: 43651n }])).cdRetorno).toBe("VALOR_PARCIAL_SUPERIOR_DFE");
    expect((await adapter.gerarDarfRad(padaria.id, [{ chaveDFE: sale.accessKey, opcaoPagamento: "PAGAMENTO_TOTAL" }])).cdRetorno).toBe("CNPJ_NAO_ADQUIRENTE");
    expect((await adapter.gerarDarfRad(padaria.id, [])).cdRetorno).toBe("DADOS_DE_ENTRADA_INVALIDOS");
    for (const m of Object.values(RAD_ERROR_MESSAGE)) expect(m).toMatch(/[ãçéêíóú]/);
  });
});
