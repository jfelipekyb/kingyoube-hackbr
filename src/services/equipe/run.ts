// Rodada da equipe (docs/09): uma chamada por agente, na ordem da tabela; idempotente.
// Cada agente é fachada fina sobre o serviço de domínio. Nenhum agente aprova nada: a rodada só prepara.
import { sendDailySummary } from "@/services/kim/resumo";
import { and, desc, eq, gte, inArray, isNotNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { agentEvents, agentRuns, companies, counterparties, docWatch, invoices, outboundMessages, radProposals, reconciliationItems, rfbRequests, type RunStepState } from "@/db/schema";
import type { Db } from "@/db/types";
import { isSimulado, type Env } from "@/lib/config";
import { recordAudit } from "@/services/auditoria";
import { portfolioMetrics, portfolioTotals, radCandidates } from "@/services/carteira/metrics";
import { reconcilePortfolio } from "@/services/conciliacao";
import { reviewPortfolio } from "@/services/conferente";
import { chargeIdempotencyKey, findSupplierContact, notifySupplier } from "@/services/fornecedor";
import { prepareProposal } from "@/services/rad";
import { createReceitaAdapter, pollRequests, syncPortfolio } from "@/services/receita";
import { checkDocs } from "@/services/vigia/radar";
import { createScraper, RADAR_URLS, type Scraper } from "@/services/vigia/scrape";
import type { AgentKey } from "./agents";
import { recordAgentEvent } from "./index";

export const ROUND_AGENTS = ["captura", "apuracao", "conciliador", "conferente", "analista", "tesouraria", "vigia", "mensageiro", "kim"] as const satisfies readonly AgentKey[];
export type RoundAgent = (typeof ROUND_AGENTS)[number];
export const isRoundAgent = (v: string): v is RoundAgent => (ROUND_AGENTS as readonly string[]).includes(v);

export type EffortTask = "conferir_nota" | "sincronizar_servico" | "investigar_divergencia" | "preparar_rad" | "achar_contato" | "escrever_email" | "ler_documentacao";

/** Rodada parada há mais que isto (aba fechada no meio) deixa de bloquear uma nova. */
export const RUN_STALE_MS = 15 * 60_000;
/** Trava de um passo em execução; vencida, outra chamada pode retomar o passo. */
const STEP_LOCK_MS = 5 * 60_000;
/** Vigia: leitura de menos de 24 h vale como cache (0 páginas lidas nesta rodada). */
export const RADAR_CACHE_MS = 24 * 60 * 60_000;
const APURACAO_MAX_POLLS = 3;

export interface RunDeps {
  db: Db;
  env?: Env;
  now?: () => Date;
  /** `undefined` = Firecrawl real se FIRECRAWL_API_KEY existir; `null` = sem leitura. */
  scraper?: Scraper | null;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
}

export class RunError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type AgentRun = typeof agentRuns.$inferSelect;
export interface StepResult {
  done: boolean;
  step: RunStepState;
  run: AgentRun;
}

interface Outcome {
  done: boolean;
  summary?: string;
  status?: RunStepState["status"];
  /** Tarefas feitas de fato (horas) e `clientes` da rodada (base da projeção). */
  counts?: Partial<Record<EffortTask | "clientes", number>>;
  cursor?: Record<string, unknown>;
  /** Se o serviço já gravou o próprio evento-resumo com o runId, não duplica. */
  eventRecorded?: boolean;
}

interface Ctx {
  deps: RunDeps;
  env: Env;
  now: () => Date;
  run: AgentRun;
  cursor: Record<string, unknown>;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
const FINAL: RunStepState["status"][] = ["feito", "revisado_ok", "revisado_divergente"];
export const isFinal = (s: RunStepState | undefined) => !!s && FINAL.includes(s.status);
const slugName = (slug: string) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

async function captura({ deps }: Ctx): Promise<Outcome> {
  const [row] = await deps.db
    .select({ notes: sql<number>`count(*)::int`, clients: sql<number>`count(distinct ${invoices.companyId})::int` })
    .from(invoices);
  return { done: true, summary: `Recebi ${plural(row.notes, "nota", "notas")} de ${plural(row.clients, "cliente", "clientes")}.`, counts: { clientes: row.clients } };
}

async function apuracao({ deps, env, now, run, cursor }: Ctx): Promise<Outcome> {
  const { db } = deps;
  const apDeps = { db, env, now, runId: run.id, adapter: createReceitaAdapter(db, env, { now, fetch: deps.fetch }) };
  if (!cursor.opened) await syncPortfolio(apDeps);
  for (let i = 0; i < APURACAO_MAX_POLLS; i++) await pollRequests(apDeps);
  // Pedidos desta rodada e os que ela reaproveitou (abertos antes e ainda em andamento): a conciliação só começa quando todos terminam.
  const ended = ["normalizada", "erro", "expirada"] as const;
  const rows = await db
    .select({ state: rfbRequests.state })
    .from(rfbRequests)
    .where(
      and(
        eq(rfbRequests.mode, apDeps.adapter.mode),
        or(gte(rfbRequests.requestedAt, run.startedAt), gte(rfbRequests.downloadedAt, run.startedAt), notInArray(rfbRequests.state, [...ended])),
      ),
    );
  const open = rows.filter((r) => !(ended as readonly string[]).includes(r.state)).length;
  if (open > 0) return { done: false, cursor: { opened: true }, summary: `Buscando ${plural(rows.length, "arquivo", "arquivos")} na Receita${isSimulado(env) ? " (simulado)" : ""}…` };
  const files = rows.filter((r) => r.state === "normalizada").length;
  const failed = rows.length - files;
  const where = isSimulado(env) ? " na Receita (simulado)" : " na Receita";
  const summary =
    rows.length === 0
      ? "A cota do dia já foi usada: mantive a última apuração da Receita."
      : `Busquei ${plural(files, "arquivo", "arquivos")}${where} e organizei tudo.${failed ? ` ${plural(failed, "pedido falhou", "pedidos falharam")}.` : ""}`;
  return { done: true, summary, counts: { sincronizar_servico: files } };
}

async function conciliador({ deps, env, now, run }: Ctx): Promise<Outcome> {
  const { total } = await reconcilePortfolio({ db: deps.db, env, now: now(), runId: run.id, skipAnalystEvent: true });
  const attention = total.total - total.byStatus.conciliado;
  return {
    done: true,
    eventRecorded: true,
    summary: `Conciliei ${plural(total.total, "item", "itens")}: ${plural(total.byStatus.conciliado, "conciliado", "conciliados")}, ${fmt(attention)} ${attention === 1 ? "pede" : "pedem"} olhar.`,
    counts: { conferir_nota: total.total },
  };
}

async function conferente({ deps, env, now, run }: Ctx): Promise<Outcome> {
  const r = await reviewPortfolio({ db: deps.db, env, now: now(), runId: run.id });
  return { done: true, eventRecorded: true, summary: r.summary, status: r.divergent.length ? "revisado_divergente" : "revisado_ok" };
}

async function analista({ deps }: Ctx): Promise<Outcome> {
  const [row] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(reconciliationItems)
    .where(and(ne(reconciliationItems.status, "conciliado"), isNotNull(reconciliationItems.explanation)));
  return { done: true, summary: `Expliquei ${plural(row.n, "item", "itens")}.`, counts: { investigar_divergencia: row.n } };
}

const OPEN = ["rascunho", "aguardando_aprovacao", "aprovada", "darf_gerado", "erro_receita"] as const;

async function tesouraria({ deps }: Ctx): Promise<Outcome> {
  const { db } = deps;
  const candidates = (await radCandidates(db)).filter((c) => !c.hasDecision);
  // Qualquer proposta já feita para a compra (aberta ou recusada pelo contador) não é refeita pela Tesouraria.
  const openBefore = new Set(
    (await db.select({ invoiceId: radProposals.invoiceId }).from(radProposals).where(inArray(radProposals.state, [...OPEN, "recusada"]))).map((p) => p.invoiceId),
  );
  let created = 0;
  for (const c of candidates) {
    if (openBefore.has(c.invoiceId)) continue;
    await prepareProposal(db, { companyId: c.companyId, invoiceId: c.invoiceId, requestedBy: "agente:tesouraria" });
    created++;
  }
  const waiting = candidates.length - created;
  const summary =
    created > 0
      ? `Preparei ${plural(created, "guia de recolhimento", "guias de recolhimento")} para aprovação.`
      : waiting > 0
        ? `Nenhuma guia nova: ${plural(waiting, "guia já espera", "guias já esperam")} decisão.`
        : "Nenhuma compra com crédito travado: nenhuma guia a preparar.";
  return { done: true, summary, counts: { preparar_rad: created } };
}

async function candidateSuppliers(db: Db) {
  const candidates = await radCandidates(db);
  if (candidates.length === 0) return [];
  const cps = await db.select().from(counterparties).where(inArray(counterparties.cnpj, [...new Set(candidates.map((c) => c.counterpartyCnpj))]));
  return candidates.map((c) => ({ candidate: c, cp: cps.find((p) => p.cnpj === c.counterpartyCnpj) ?? null }));
}

async function vigia({ deps, env, now }: Ctx): Promise<Outcome> {
  const { db } = deps;
  const scraper = deps.scraper === undefined ? createScraper(env) : deps.scraper;
  const fresh = await db
    .select({ url: docWatch.url })
    .from(docWatch)
    .where(and(inArray(docWatch.url, RADAR_URLS), gte(docWatch.lastCheckedAt, new Date(now().getTime() - RADAR_CACHE_MS))));
  let pages = 0;
  let pagesText: string;
  // Uma leitura nas últimas 24 h vale para a rodada (mesmo parcial): no máximo uma fila de páginas pagas por dia.
  if (fresh.length > 0) {
    pagesText =
      fresh.length === RADAR_URLS.length
        ? `As ${fmt(RADAR_URLS.length)} páginas da Receita foram lidas há menos de 24 h: usei essa leitura.`
        : `${plural(fresh.length, "página da Receita foi lida", "páginas da Receita foram lidas")} há menos de 24 h: usei essa leitura.`;
  } else if (!scraper) {
    pagesText = "Sem FIRECRAWL_API_KEY: não li as páginas da Receita.";
  } else {
    const r = await checkDocs({ db, scraper, env, sleep: deps.sleep, now, fetch: deps.fetch }, "agente:vigia");
    pages = r.pages.length - r.errors;
    pagesText = `Verifiquei ${plural(pages, "página", "páginas")} da Receita.${r.changed ? ` ${plural(r.changed, "mudou", "mudaram")}: avisei por e-mail.` : ""}`;
  }
  const found: string[] = [];
  const missed: string[] = [];
  const seen = new Set<string>();
  for (const { cp } of await candidateSuppliers(db)) {
    if (!cp || cp.financeEmail || !cp.siteUrl || seen.has(cp.id)) continue;
    seen.add(cp.id);
    const name = slugName(cp.siteUrl.split("/").pop()!);
    try {
      const r = await findSupplierContact({ db, env, now, fetch: deps.fetch, scraper }, cp.id, "agente:vigia");
      if (r.status === "contato_encontrado") found.push(name);
    } catch {
      // Sem Firecrawl com APP_URL público, site fora do ar etc.: a rodada segue e o Mensageiro cobra quem tem contato.
      missed.push(name);
    }
  }
  const contactText =
    (found.length ? ` Achei o contato financeiro ${found.map((n) => `do ${n}`).join(" e ")}.` : "") +
    (missed.length ? ` Não consegui ler o site ${missed.map((n) => `do ${n}`).join(" e ")}.` : "");
  return { done: true, summary: `${pagesText}${contactText}`, counts: { ler_documentacao: pages, achar_contato: found.length } };
}

async function mensageiro({ deps, env, now }: Ctx): Promise<Outcome> {
  const { db } = deps;
  let sent = 0;
  let failed = 0;
  let already = 0;
  const suppliers = new Set<string>();
  for (const { candidate, cp } of await candidateSuppliers(db)) {
    if (!cp?.financeEmail) continue;
    const [prev] = await db.select({ id: outboundMessages.id, status: outboundMessages.lastStatus }).from(outboundMessages).where(eq(outboundMessages.idempotencyKey, chargeIdempotencyKey(candidate.invoiceId)));
    if (prev && prev.status !== "erro") {
      already++;
      continue;
    }
    const { email } = await notifySupplier({ db, env, now, fetch: deps.fetch }, candidate.invoiceId, "agente:mensageiro");
    if (email.lastStatus === "erro") {
      failed++;
      continue;
    }
    sent++;
    suppliers.add(cp.id);
  }
  const failedText = failed ? ` ${plural(failed, "e-mail foi recusado", "e-mails foram recusados")} pela Resend.` : "";
  const summary =
    (sent > 0
      ? `Cobrei ${plural(suppliers.size, "fornecedor", "fornecedores")} por e-mail.`
      : failed > 0
        ? "Nenhuma cobrança saiu."
        : already > 0
        ? `Nenhum e-mail novo: ${plural(already, "cobrança já tinha saído", "cobranças já tinham saído")}.`
        : "Nenhum fornecedor a cobrar.") + failedText;
  return { done: true, summary, counts: { escrever_email: sent } };
}

async function kim({ deps, env, now }: Ctx): Promise<Outcome> {
  const t = portfolioTotals(await portfolioMetrics(deps.db));
  await sendDailySummary(deps.db, { now: now(), actor: "agente:kim", env });
  return { done: true, summary: `Resumo pronto: ${plural(t.decisions, "decisão espera", "decisões esperam")} o contador.` };
}

const HANDLERS: Record<RoundAgent, (ctx: Ctx) => Promise<Outcome>> = { captura, apuracao, conciliador, conferente, analista, tesouraria, vigia, mensageiro, kim };

export async function getRun(db: Db, runId: string): Promise<AgentRun | null> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  return run ?? null;
}

export async function latestRun(db: Db): Promise<AgentRun | null> {
  const [run] = await db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(1);
  return run ?? null;
}

/** Abre a rodada. Se já há uma em andamento (não parada), devolve a mesma: dois cliques = uma rodada. */
export async function startRun(deps: RunDeps, actor: string): Promise<{ run: AgentRun; created: boolean }> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const staleBefore = new Date(now.getTime() - RUN_STALE_MS);
  await db.update(agentRuns).set({ status: "erro", finishedAt: now }).where(and(eq(agentRuns.status, "rodando"), lt(agentRuns.startedAt, staleBefore)));
  const [current] = await db.select().from(agentRuns).where(eq(agentRuns.status, "rodando")).orderBy(desc(agentRuns.startedAt)).limit(1);
  if (current) return { run: current, created: false };
  const [run] = await db.insert(agentRuns).values({ triggeredBy: actor, startedAt: now }).returning();
  await recordAudit(db, { actor, action: "equipe.rodada", entity: "agent_run", entityId: run.id, result: "iniciada" });
  return { run, created: true };
}

const stepJson = (s: RunStepState & { lockedUntil?: string }) => JSON.stringify(s);

/** Executa (ou continua) o passo de um agente. Passo concluído devolve o mesmo resultado sem refazer nada. */
export async function runAgentStep(deps: RunDeps, runId: string, agent: string): Promise<StepResult> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  if (!isRoundAgent(agent)) throw new RunError(404, "AGENTE_DESCONHECIDO", "Este agente não faz parte da rodada.");
  const run = await getRun(db, runId);
  if (!run) throw new RunError(404, "RODADA_NAO_ENCONTRADA", "Rodada não encontrada.");
  const current = run.steps[agent];
  if (isFinal(current)) return { done: true, step: current!, run };
  if (run.status !== "rodando") throw new RunError(409, "RODADA_ENCERRADA", "Esta rodada já terminou; comece outra.");
  const idx = ROUND_AGENTS.indexOf(agent);
  if (idx > 0 && !isFinal(run.steps[ROUND_AGENTS[idx - 1]])) throw new RunError(409, "FORA_DE_ORDEM", "O agente anterior ainda não terminou.");

  // Trava do passo: só uma chamada por vez executa o agente (as outras recebem o estado atual).
  const at = now();
  const claim: RunStepState & { lockedUntil: string } = {
    ...(current ?? {}),
    status: "trabalhando",
    startedAt: current?.startedAt ?? at.toISOString(),
    lockedUntil: new Date(at.getTime() + STEP_LOCK_MS).toISOString(),
  };
  const claimed = await db
    .update(agentRuns)
    .set({ steps: sql`jsonb_set(${agentRuns.steps}, ${`{${agent}}`}::text[], ${stepJson(claim)}::jsonb)` })
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.status, "rodando"),
        or(
          sql`${agentRuns.steps} -> ${agent} is null`,
          sql`(${agentRuns.steps} -> ${agent} ->> 'status') = 'erro'`,
          sql`coalesce((${agentRuns.steps} -> ${agent} ->> 'lockedUntil')::timestamptz, 'epoch') < ${at.toISOString()}::timestamptz`,
        ),
      ),
    )
    .returning();
  if (claimed.length === 0) {
    const again = (await getRun(db, runId))!;
    const step = again.steps[agent] ?? claim;
    return { done: isFinal(step), step, run: again };
  }
  if (!current) {
    await recordAgentEvent(db, { runId, agent, action: "rodada", entity: "agent_run", entityId: runId, status: "trabalhando", summary: "Comecei a minha parte da rodada." });
  }

  let outcome: Outcome;
  try {
    outcome = await HANDLERS[agent]({ deps, env, now, run: claimed[0], cursor: current?.cursor ?? {} });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro inesperado";
    const failed: RunStepState = { ...claim, status: "erro", summary: `Não consegui terminar: ${msg}` };
    await db.update(agentRuns).set({ steps: sql`jsonb_set(${agentRuns.steps}, ${`{${agent}}`}::text[], ${stepJson(failed)}::jsonb)` }).where(eq(agentRuns.id, runId));
    await recordAgentEvent(db, { runId, agent, action: "rodada", entity: "agent_run", entityId: runId, status: "erro", summary: failed.summary! });
    await recordAudit(db, { actor: `agente:${agent}`, action: "equipe.rodada.passo", entity: "agent_run", entityId: runId, result: "erro", details: { agente: agent } });
    return { done: false, step: failed, run: (await getRun(db, runId))! };
  }

  const end = now().toISOString();
  const step: RunStepState = outcome.done
    ? { status: outcome.status ?? "feito", summary: outcome.summary, startedAt: claim.startedAt, finishedAt: end }
    : { status: "trabalhando", summary: outcome.summary, startedAt: claim.startedAt, cursor: outcome.cursor };
  const counts = outcome.done ? JSON.stringify(outcome.counts ?? {}) : "{}";
  const finishing = outcome.done && idx === ROUND_AGENTS.length - 1;
  const [saved] = await db
    .update(agentRuns)
    .set({
      steps: sql`jsonb_set(${agentRuns.steps}, ${`{${agent}}`}::text[], ${stepJson(step)}::jsonb)`,
      counts: sql`${agentRuns.counts} || ${counts}::jsonb`,
      ...(finishing ? { status: "concluida" as const, finishedAt: new Date(end) } : {}),
    })
    .where(eq(agentRuns.id, runId))
    .returning();
  if (outcome.done) {
    const total = Object.entries(outcome.counts ?? {}).reduce((a, [k, v]) => (k === "clientes" ? a : a + (v ?? 0)), 0);
    if (!outcome.eventRecorded) {
      await recordAgentEvent(db, { runId, agent, action: "rodada", entity: "agent_run", entityId: runId, status: step.status, summary: step.summary!, count: total });
    }
    await recordAudit(db, { actor: `agente:${agent}`, action: "equipe.rodada.passo", entity: "agent_run", entityId: runId, result: step.status, details: { agente: agent, contagem: total } });
    if (finishing) await recordAudit(db, { actor: "agente:kim", action: "equipe.rodada", entity: "agent_run", entityId: runId, result: "concluida" });
  }
  return { done: outcome.done, step, run: saved };
}

/** Linha do tempo da rodada: eventos com o runId e os que os serviços gravaram durante a rodada. */
export async function runTimeline(db: Db, run: AgentRun, limit = 40) {
  const end = run.finishedAt ?? new Date();
  return db
    .select({ id: agentEvents.id, at: agentEvents.at, agent: agentEvents.agent, status: agentEvents.status, summary: agentEvents.summary })
    .from(agentEvents)
    .where(or(eq(agentEvents.runId, run.id), and(gte(agentEvents.at, run.startedAt), sql`${agentEvents.at} <= ${end.toISOString()}::timestamptz`)))
    .orderBy(desc(agentEvents.at))
    .limit(limit);
}

export async function companyCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(companies);
  return row.n;
}
