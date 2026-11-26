import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import type { Scraper } from "@/services/vigia/scrape";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { ROUND_AGENTS, RunError, runAgentStep, startRun, type RunDeps } from "./run";

const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY: "2026-11-20" };
const page = (v: string) => `# Página\n\n## 2. Histórico de versão\n\n| Data | Versão | Descrição |\n|---|---|---|\n| 01/10/2026 | ${v} | ajuste |\n\n## 3. Regras`;
const scraper: Scraper = {
  scrape: async (url) => {
    const name = url.slice(RECEITA_DOCS_BASE.length);
    return { markdown: page(WATCHED_PAGES.find((p) => p.page === name)?.version ?? "1.0"), changeTracking: { changeStatus: "same", previousScrapeAt: null } };
  },
};

let db: Db;
let close: () => Promise<void>;
const clock = { t: Date.UTC(2026, 10, 20, 13) };
let deps: RunDeps;

async function runRound() {
  const { run } = await startRun(deps, "usuario:teste");
  const calls: Record<string, number> = {};
  for (const agent of ROUND_AGENTS) {
    for (let i = 0; ; i++) {
      calls[agent] = i + 1;
      const r = await runAgentStep(deps, run.id, agent);
      clock.t += 3_000;
      if (r.done) break;
      if (i > 30) throw new Error(`${agent} não terminou`);
    }
  }
  const [final] = await db.select().from(s.agentRuns).where(eq(s.agentRuns.id, run.id));
  return { run: final, calls };
}

const countOf = async (table: typeof s.radProposals | typeof s.outboundMessages) => (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0].n;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: env.DEMO_TODAY });
  deps = { db, env, now: () => new Date(clock.t), scraper, sleep: async () => {} };
}, 120_000);
afterAll(() => close());

describe("Rodada da equipe (docs/09)", () => {
  let first: Awaited<ReturnType<typeof runRound>>;

  it("seed: os resumos de cada agente batem com a tabela do docs/09", async () => {
    first = await runRound();
    expect(first.run.status).toBe("concluida");
    const summaries = Object.fromEntries(ROUND_AGENTS.map((a) => [a, first.run.steps[a]?.summary]));
    expect(summaries).toEqual({
      captura: "Recebi 412 notas de 12 clientes.",
      apuracao: "Busquei 48 arquivos na Receita (simulado) e organizei tudo.",
      conciliador: "Conciliei 413 itens: 405 conciliados, 8 pedem olhar.",
      conferente: "Conferi 413 de 413. Nenhuma diferença.",
      analista: "Expliquei 8 itens.",
      tesouraria: "Preparei 2 guias de recolhimento para aprovação.",
      vigia: "Verifiquei 9 páginas da Receita. Achei o contato financeiro do Moinho Estrela.",
      mensageiro: "Cobrei 2 fornecedores por e-mail.",
      kim: "Resumo pronto: 3 decisões esperam o contador.",
    });
    expect(first.run.steps.conferente?.status).toBe("revisado_ok");
    expect(first.run.counts).toEqual({
      sincronizar_servico: 48,
      conferir_nota: 413,
      investigar_divergencia: 8,
      preparar_rad: 2,
      ler_documentacao: 9,
      achar_contato: 1,
      escrever_email: 2,
    });
  });

  it("nenhum agente aprova: as propostas ficam em rascunho, esperando o contador", async () => {
    const proposals = await db.select({ state: s.radProposals.state, approvedBy: s.radProposals.approvedBy }).from(s.radProposals);
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.state === "rascunho" && p.approvedBy === null)).toBe(true);
  });

  it("chamar de novo um passo concluído devolve o mesmo resultado, sem refazer", async () => {
    const events = (await db.select({ n: sql<number>`count(*)::int` }).from(s.agentEvents))[0].n;
    const again = await runAgentStep(deps, first.run.id, "tesouraria");
    expect(again.done).toBe(true);
    expect(again.step.summary).toBe("Preparei 2 guias de recolhimento para aprovação.");
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(s.agentEvents))[0].n).toBe(events);
  });

  it("recusa agente fora da rodada e fora de ordem", async () => {
    await expect(runAgentStep(deps, first.run.id, "contador")).rejects.toBeInstanceOf(RunError);
    const { run } = await startRun(deps, "usuario:teste");
    await expect(runAgentStep(deps, run.id, "conciliador")).rejects.toMatchObject({ code: "FORA_DE_ORDEM" });
    await db.update(s.agentRuns).set({ status: "erro" }).where(eq(s.agentRuns.id, run.id));
  });

  it("rodar 2× não duplica propostas, contatos nem e-mails", async () => {
    const before = { proposals: await countOf(s.radProposals), emails: await countOf(s.outboundMessages), contacts: await db.select().from(s.counterparties) };
    clock.t += 60 * 60_000;
    const second = await runRound();
    expect(second.run.status).toBe("concluida");
    expect(await countOf(s.radProposals)).toBe(before.proposals);
    expect(await countOf(s.outboundMessages)).toBe(before.emails);
    expect(await db.select().from(s.counterparties)).toEqual(before.contacts);
    expect(second.run.counts).toMatchObject({ preparar_rad: 0, achar_contato: 0, escrever_email: 0, ler_documentacao: 0 });
    expect(second.run.steps.tesouraria?.summary).toBe("Nenhuma guia nova: 2 guias já esperam decisão.");
    expect(second.run.steps.mensageiro?.summary).toBe("Nenhum e-mail novo: 2 cobranças já tinham saído.");
    expect(second.run.steps.vigia?.summary).toBe("As 9 páginas da Receita foram lidas há menos de 24 h: usei essa leitura.");
  });

  it("dois cliques em Rodar a equipe abrem uma só rodada", async () => {
    const a = await startRun(deps, "usuario:teste");
    const b = await startRun(deps, "usuario:teste");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.run.id).toBe(a.run.id);
  });
});
