import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { ROUND_AGENTS, runAgentStep, startRun, type RunDeps } from "@/services/equipe/run";
import { chargeIdempotencyKey } from "@/services/fornecedor";
import { approveProposal, generateDarf, prepareProposal, rejectProposal, submitProposal } from "@/services/rad";
import { createReceitaAdapter, pollRequests, syncPortfolio } from "@/services/receita";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import type { Scraper } from "@/services/vigia/scrape";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { ANALISTA, CONTADOR, invoiceOf, padaria } from "@/test/rad-fixture";
import { answerQuestion, FORBIDDEN_ANSWER, HELP_ANSWER, NOT_RUN_ANSWER } from "./answers";
import { classify } from "./intents";
import { sendDailySummary, SUMMARY_TO, summaryLine } from "./resumo";

const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY: "2026-11-20" };
const page = (v: string) => `# Página\n\n## 2. Histórico de versão\n\n| Data | Versão | Descrição |\n|---|---|---|\n| 01/10/2026 | ${v} | ajuste |\n\n## 3. Regras`;
const scraper: Scraper = {
  scrape: async (url) => ({
    markdown: page(WATCHED_PAGES.find((p) => p.page === url.slice(RECEITA_DOCS_BASE.length))?.version ?? "1.0"),
    changeTracking: { changeStatus: "same", previousScrapeAt: null },
  }),
};

describe("intenções por regra (docs/09 e docs/11)", () => {
  it.each([
    ["Kim, aprova a guia", "acao_proibida"],
    ["Pode aprovar o RAD da Padaria?", "acao_proibida"],
    ["gera a guia pra mim", "acao_proibida"],
    ["Gerar o DARF agora", "acao_proibida"],
    ["paga isso", "acao_proibida"],
    ["Recusa a proposta", "acao_proibida"],
    ["Kim, aprova a guia e me diz o que preciso decidir hoje", "acao_proibida"],
    ["O que eu preciso decidir hoje?", "decisoes_hoje"],
    ["Tem alguma decisão pendente?", "decisoes_hoje"],
    ["Quanto crédito está travado?", "credito_travado"],
    ["Por que a Padaria Boa Massa?", "motivo_cliente"],
    ["Qual o motivo da padaria?", "motivo_cliente"],
    ["Os fornecedores foram cobrados?", "fornecedor_cobrado"],
    ["Você já fez a cobrança?", "fornecedor_cobrado"],
    ["Quantas horas a equipe economizou?", "horas"],
    ["Quanto tempo a equipe devolveu?", "horas"],
    ["Qual fornecedor está no vermelho?", "semaforo_fornecedores"],
    ["Como está o semáforo dos fornecedores?", "semaforo_fornecedores"],
    ["Tem cliente inadimplente?", "semaforo_clientes"],
    ["O que falta receber dos clientes?", "semaforo_clientes"],
    ["Qual cliente está no vermelho?", "semaforo_clientes"],
    ["Qual a previsão do tempo amanhã em Recife", "horas"],
    ["Me conta uma piada", "ajuda"],
  ])("%s → %s", (text, intent) => {
    expect(classify(text)).toBe(intent);
  });
});

let db: Db;
let close: () => Promise<void>;
const clock = { t: Date.UTC(2026, 10, 20, 13) };
let deps: RunDeps;
const ask = async (text: string) => answerQuestion(db, text);

async function runRound() {
  const { run } = await startRun(deps, "usuario:teste");
  for (const agent of ROUND_AGENTS) {
    for (let i = 0; ; i++) {
      const r = await runAgentStep(deps, run.id, agent);
      clock.t += 3_000;
      if (r.done) break;
      if (i > 30) throw new Error(`${agent} não terminou`);
    }
  }
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: env.DEMO_TODAY });
  deps = { db, env, now: () => new Date(clock.t), scraper, sleep: async () => {} };
}, 120_000);
afterAll(() => close());

describe("respostas da Kim com números da base (docs/09)", () => {
  it("antes de qualquer rodada: decisoes_hoje responde que a equipe ainda não rodou", async () => {
    expect(await ask("O que eu preciso decidir hoje?")).toEqual({ intent: "decisoes_hoje", fala: NOT_RUN_ANSWER, legenda: NOT_RUN_ANSWER });
  });

  it("seed + rodada completa, cobrança saiu sem confirmação de entrega: a última frase vem sem 'já'", async () => {
    await runRound();
    // Sem RESEND_API_KEY a cobrança só é registrada: a Kim diz que é simulada.
    expect((await ask("O que eu preciso decidir hoje?")).fala).toContain("Registrei a cobrança dos dois fornecedores, em modo simulado: nenhum e-mail saiu de verdade.");
    expect((await ask("Os fornecedores foram cobrados?")).fala).toBe("Registrei a cobrança dos dois fornecedores, em modo simulado: nenhum e-mail saiu de verdade.");
    // A Resend aceitou os e-mails (status "sent"), sem confirmação de entrega ainda.
    await db.update(s.outboundMessages).set({ lastStatus: "sent" }).where(and(eq(s.outboundMessages.kind, "cobranca_fornecedor"), eq(s.outboundMessages.channel, "email")));
    const a = await ask("O que eu preciso decidir hoje?");
    expect(a.fala).toContain("Os dois fornecedores foram cobrados por e-mail.");
    expect((await ask("Os fornecedores foram cobrados?")).fala).toBe("Cobrei os dois fornecedores por e-mail. Ainda não tenho confirmação de entrega.");
  }, 120_000);

  it("seed + rodada completa (estado do vídeo): decisoes_hoje devolve exatamente a frase de docs/09, e a legenda com números formatados", async () => {
    // A Resend confirmou a entrega da cobrança do Moinho Estrela (webhook email.delivered).
    await db.update(s.outboundMessages).set({ lastStatus: "delivered" }).where(eq(s.outboundMessages.idempotencyKey, chargeIdempotencyKey(invoiceOf("C2").id)));
    const a = await ask("O que eu preciso decidir hoje?");
    expect(a).toEqual({
      intent: "decisoes_hoje",
      fala: "Conferi quatrocentas e doze notas de doze clientes. São três decisões, todas na Padaria Boa Massa: duas guias de recolhimento e uma diferença de doze reais. Há mil duzentos e trinta e seis reais e cinquenta centavos de crédito travado. Os dois fornecedores já foram cobrados por e-mail.",
      legenda: "Conferi 412 notas de 12 clientes. São 3 decisões, todas na Padaria Boa Massa: 2 guias de recolhimento e uma diferença de R$ 12,00. Há R$ 1.236,50 de crédito travado. Os 2 fornecedores já foram cobrados por e-mail.",
    });
    expect(a.fala).not.toMatch(/\d/);
  });

  it("demais intenções de docs/09 no estado do vídeo", async () => {
    expect((await ask("Quanto crédito está travado?")).fala).toBe("O crédito travado na carteira é de mil duzentos e trinta e seis reais e cinquenta centavos, todo na Padaria Boa Massa.");
    const motivo = await ask("Por que a Padaria Boa Massa?");
    expect(motivo.intent).toBe("motivo_cliente");
    expect(motivo.fala).toMatch(/^Na Padaria Boa Massa, o Moinho Estrela não recolheu a CBS da nota mil duzentos e oitenta e quatro\. São quatrocentos e trinta e seis reais e cinquenta centavos de crédito esperando\./);
    expect(motivo.legenda).toContain("nota 1.284. São R$ 436,50 de crédito esperando.");
    expect((await ask("Os fornecedores foram cobrados?")).fala).toBe("Cobrei os dois fornecedores por e-mail. O do Moinho Estrela já foi entregue.");
    const h = await ask("Quantas horas a equipe economizou?");
    expect(h.fala).toMatch(/^Nesta rodada, a equipe fez o equivalente a .+ de trabalho, pelas premissas da tela Equipe\.$/);
    expect(h.fala).not.toMatch(/\d/);
    expect(await ask("Me conta uma piada")).toEqual({ intent: "ajuda", fala: HELP_ANSWER, legenda: HELP_ANSWER });
  });

  it("semaforo_fornecedores: a frase de docs/11", async () => {
    const a = await ask("Qual fornecedor está no vermelho?");
    expect(a.intent).toBe("semaforo_fornecedores");
    expect(a.fala).toBe("Na Padaria Boa Massa, um fornecedor está no vermelho: a Forno Forte não recolheu e recusou o RAD. O Moinho Estrela está no amarelo: recomendo recolher via RAD.");
    expect((await ask("Como está o semáforo dos fornecedores da Padaria?")).fala).toBe(a.fala);
    expect((await ask("Semáforo dos fornecedores da Gráfica Tinta Viva")).fala).toBe("Na Gráfica Tinta Viva, todos os fornecedores estão no verde.");
  });

  it("semaforo_clientes: resume amarelos e vermelhos das vendas", async () => {
    const a = await ask("Tem cliente inadimplente?");
    expect(a.intent).toBe("semaforo_clientes");
    expect(a.fala).toMatch(/^Na Padaria Boa Massa, uma venda está no vermelho: .+ não pagou e há .+ de CBS em aberto; recomendo recolher a CBS e cobrar o cliente\. Uma venda está no amarelo: .+ ainda vai pagar, com .+ de CBS em aberto; recomendo cobrar antes do vencimento\.$/);
    expect(a.fala).not.toMatch(/\d|FICTÍCIA/);
  });

  it("resumo do dia da Kim no WhatsApp simulado: '3 decisões, R$ 1.236,50 travado', em outbound_messages e na auditoria, sem duplicar", async () => {
    const rows = await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.kind, "resumo_kim"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "whatsapp", lastStatus: "simulado", toLabel: SUMMARY_TO, refId: "2026-11-20" });
    expect(rows[0].body).toContain("3 decisões, R$ 1.236,50 travado");
    const [audit] = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, rows[0].id), eq(s.auditLog.action, "mensagem.whatsapp_resumo_kim")));
    expect(audit).toMatchObject({ actor: "agente:kim", action: "mensagem.whatsapp_resumo_kim", result: "simulado" });
    const [ev] = await db.select().from(s.agentEvents).where(eq(s.agentEvents.entityId, rows[0].id));
    expect(ev).toMatchObject({ agent: "kim", action: "resumo_whatsapp" });
    const again = await sendDailySummary(db, { now: new Date(clock.t), actor: "agente:kim", env });
    expect(again.created).toBe(false);
    expect(await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.kind, "resumo_kim"))).toHaveLength(1);
    expect(summaryLine(1, 43650n)).toBe("1 decisão, R$ 436,50 travado");
  });

  it("'Kim, aprova a guia' → acao_proibida e nenhuma proposta muda de estado", async () => {
    const before = await db.select({ id: s.radProposals.id, state: s.radProposals.state, approvedBy: s.radProposals.approvedBy }).from(s.radProposals).orderBy(s.radProposals.id);
    const audits = (await db.select().from(s.auditLog)).length;
    expect(await ask("Kim, aprova a guia")).toEqual({ intent: "acao_proibida", fala: FORBIDDEN_ANSWER, legenda: FORBIDDEN_ANSWER });
    expect(await db.select({ id: s.radProposals.id, state: s.radProposals.state, approvedBy: s.radProposals.approvedBy }).from(s.radProposals).orderBy(s.radProposals.id)).toEqual(before);
    expect((await db.select().from(s.auditLog)).length).toBe(audits);
  });

  it("depois de aprovar e confirmar o C2, a resposta muda sozinha", async () => {
    const [p] = await db.select().from(s.radProposals).where(eq(s.radProposals.invoiceId, invoiceOf("C2").id));
    const proposal = p ?? (await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C2").id, requestedBy: ANALISTA }));
    const adapter = createReceitaAdapter(db, env, { now: deps.now });
    await submitProposal(db, { id: proposal.id, companyId: padaria.id, actor: ANALISTA });
    await approveProposal(db, { id: proposal.id, companyId: padaria.id, actor: CONTADOR });
    await generateDarf({ db, adapter }, { id: proposal.id, companyId: padaria.id, actor: CONTADOR });
    await syncPortfolio({ db, adapter, env, now: deps.now });
    for (let i = 0; i < 20; i++) {
      clock.t += 2_000;
      await pollRequests({ db, adapter, env, now: deps.now });
    }
    expect((await db.select().from(s.radProposals).where(eq(s.radProposals.id, proposal.id)))[0].state).toBe("pago_confirmado");
    expect((await ask("O que eu preciso decidir hoje?")).fala).toBe(
      "Conferi quatrocentas e doze notas de doze clientes. São duas decisões, todas na Padaria Boa Massa: uma guia de recolhimento e uma diferença de doze reais. Há oitocentos reais de crédito travado. O fornecedor foi cobrado por e-mail.",
    );
    expect((await ask("Quanto crédito está travado?")).fala).toBe("O crédito travado na carteira é de oitocentos reais, todo na Padaria Boa Massa.");
  }, 120_000);

  it("Auto Peças Rota 9: nota sem retorno da Receita não vira 'tudo conciliado' nem 'tudo verde'", async () => {
    const motivo = await ask("Por que a Auto Peças Rota 9?");
    expect(motivo.fala).not.toContain("está tudo conciliado");
    expect(motivo.fala).toMatch(/ainda não batem? com a Receita/);
    expect((await ask("Como estão as vendas da Auto Peças Rota 9?")).fala).not.toContain("todas as vendas estão no verde");
  });

  it("guia recusada pelo contador sai das decisões da Kim e do resumo do dia, como na Sala", async () => {
    const [p] = await db.select().from(s.radProposals).where(eq(s.radProposals.invoiceId, invoiceOf("C3").id));
    const proposal = p ?? (await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C3").id, requestedBy: ANALISTA }));
    if (proposal.state === "rascunho") await submitProposal(db, { id: proposal.id, companyId: padaria.id, actor: ANALISTA });
    await rejectProposal(db, { id: proposal.id, companyId: padaria.id, actor: CONTADOR, reason: "Fornecedor vai regularizar" });
    expect((await ask("O que eu preciso decidir hoje?")).legenda).toContain("É uma decisão, na Padaria Boa Massa: uma diferença de R$ 12,00.");
    const sent = await sendDailySummary(db, { now: new Date(clock.t + 86_400_000), actor: "agente:kim", env });
    expect(sent.line).toBe("1 decisão, R$ 800,00 travado");
  });
});
