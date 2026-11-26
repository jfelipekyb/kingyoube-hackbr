// Agente Apuração (docs/09): abre as consultas da carteira, acompanha a situação, baixa e normaliza.
// Máquina de estados de rfb_requests (docs/02); cada etapa grava agent_event "apuracao" (+ auditoria).
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { companies, effortStandards, rfbCredits, rfbDebits, rfbPayments, rfbRawFiles, rfbRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { receitaMode, type Env } from "@/lib/config";
import { addDays, brasiliaDay, daysBetween } from "@/lib/dates";
import { recordAgentEvent, type AgentEventStatus } from "@/services/equipe";
import { confirmRadPayments } from "@/services/rad/confirm";
import { normalizeFile, storeRawFile } from "./normalize";
import { ReceitaFileError } from "./parser";
import { piiHashKey } from "./pii";
import { RECEITA_SERVICES, ReceitaError, SERVICE_LABEL, type ReceitaAdapter, type ReceitaService } from "./types";
import { newWebhookNonce, webhookUrl } from "./webhook-nonce";

export type RequestState = (typeof rfbRequests.$inferSelect)["state"];
export type RequestRow = typeof rfbRequests.$inferSelect;

export const OPEN_STATES = ["solicitada", "em_processamento", "concluida", "baixada"] as const satisfies RequestState[];
export const EXPIRE_MINUTES = 240;
/** Reserva sem tíquete além disso: a abertura morreu no meio (ex.: função encerrada). */
export const RESERVATION_TIMEOUT_MS = 2 * 60_000;
export const WINDOW_RISK_DAYS = 6;
export const DEFAULT_DAILY_LIMIT = 4;

export interface ApuracaoDeps {
  db: Db;
  adapter: ReceitaAdapter;
  env?: Env;
  now?: () => Date;
  runId?: string | null;
}

const nowOf = (deps: ApuracaoDeps) => (deps.now ? deps.now() : new Date());
const isOpen = (state: RequestState) => (OPEN_STATES as readonly string[]).includes(state);

/** RFB_DAILY_LIMIT (padrão 4): chamadas por serviço, por cliente e por dia de Brasília. */
export function dailyLimit(env: Env = process.env): number {
  const raw = env.RFB_DAILY_LIMIT?.trim();
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error("RFB_DAILY_LIMIT inválido: use um inteiro ≥ 0");
  return n;
}

/** [início, fim) do dia de Brasília (UTC−3, sem horário de verão). */
export function brasiliaDayBounds(now: Date): { day: string; start: Date; end: Date } {
  const day = brasiliaDay(now);
  return { day, start: new Date(`${day}T00:00:00-03:00`), end: new Date(`${addDays(day, 1)}T00:00:00-03:00`) };
}

/** Dias desde a última sincronização concluída; em risco com 6 ou mais (a janela da Receita é de 8 dias). */
export function windowRisk(lastCompletedAt: Date | null, now: Date): { days: number | null; atRisk: boolean } {
  if (!lastCompletedAt) return { days: null, atRisk: false };
  const days = daysBetween(brasiliaDay(lastCompletedAt), brasiliaDay(now));
  return { days, atRisk: days >= WINDOW_RISK_DAYS };
}

type Mode = ReturnType<typeof receitaMode>;

/** Pedidos de um modo não contam nem aparecem no outro (simulado × real na mesma base). */
export async function quotaUsed(db: Db, companyId: string, service: ReceitaService, now: Date, mode: Mode): Promise<number> {
  const { start, end } = brasiliaDayBounds(now);
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(rfbRequests)
    .where(
      and(
        eq(rfbRequests.companyId, companyId),
        eq(rfbRequests.service, service),
        eq(rfbRequests.mode, mode),
        gte(rfbRequests.requestedAt, start),
        lt(rfbRequests.requestedAt, end),
      ),
    );
  return row.n;
}

type Company = { id: string; name: string; cnpjRoot: string };

async function loadCompany(db: Db, companyId: string): Promise<Company | null> {
  const [c] = await db
    .select({ id: companies.id, name: companies.name, cnpjRoot: companies.cnpjRoot })
    .from(companies)
    .where(eq(companies.id, companyId));
  return c ?? null;
}

async function syncMinutes(db: Db): Promise<number> {
  const [row] = await db.select({ minutes: effortStandards.minutes }).from(effortStandards).where(eq(effortStandards.task, "sincronizar_servico"));
  return row?.minutes ?? 0;
}

function shortName(name: string) {
  return name.replace(/\s*\(FICTÍCIA\)$/, "");
}

async function event(
  deps: ApuracaoDeps,
  db: Db,
  input: { action: string; entityId: string; status: AgentEventStatus; summary: string; count?: number; minutesSaved?: number },
) {
  await recordAgentEvent(db, { runId: deps.runId ?? null, agent: "apuracao", entity: "rfb_request", ...input });
}

function modeTag(deps: ApuracaoDeps) {
  return deps.adapter.mode === "SIMULADO" ? " (simulado)" : "";
}

/** Reservas sem tíquete há mais de 2 min viram `erro` (continuam contando na cota). */
async function abandonStaleReservations(db: Db, filter: { companyId?: string | null; service?: ReceitaService }, now: Date) {
  await db
    .update(rfbRequests)
    .set({ state: "erro", errorCode: "SEM_TIQUETE", errorMessage: "abertura interrompida antes de receber o tíquete" })
    .where(
      and(
        eq(rfbRequests.state, "solicitada"),
        isNull(rfbRequests.ticket),
        lt(rfbRequests.requestedAt, new Date(now.getTime() - RESERVATION_TIMEOUT_MS)),
        filter.companyId ? eq(rfbRequests.companyId, filter.companyId) : undefined,
        filter.service ? eq(rfbRequests.service, filter.service) : undefined,
      ),
    );
}

export type OpenResult =
  | { service: ReceitaService; status: "aberta"; requestId: string }
  | { service: ReceitaService; status: "em_andamento"; requestId: string }
  | { service: ReceitaService; status: "cota_esgotada"; used: number; limit: number }
  | { service: ReceitaService; status: "erro"; requestId: string; code: string };

/** Abre uma consulta respeitando a cota. A trava vem antes de qualquer chamada ao adaptador. */
export async function openConsulta(deps: ApuracaoDeps, company: Company, service: ReceitaService): Promise<OpenResult> {
  const { db, adapter } = deps;
  const now = nowOf(deps);
  const limit = dailyLimit(deps.env);
  const label = `${SERVICE_LABEL[service]} de ${shortName(company.name)}`;

  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rfb:${company.id}:${service}`}))`);
    await abandonStaleReservations(tx, { companyId: company.id, service }, now);
    const [inFlight] = await tx
      .select({ id: rfbRequests.id })
      .from(rfbRequests)
      .where(
        and(
          eq(rfbRequests.companyId, company.id),
          eq(rfbRequests.service, service),
          eq(rfbRequests.mode, adapter.mode),
          inArray(rfbRequests.state, [...OPEN_STATES]),
        ),
      )
      .limit(1);
    if (inFlight) return { kind: "em_andamento" as const, requestId: inFlight.id };
    const used = await quotaUsed(tx, company.id, service, now, adapter.mode);
    if (used >= limit) return { kind: "cota" as const, used };
    const { nonce, hash } = newWebhookNonce();
    const [row] = await tx
      .insert(rfbRequests)
      .values({ companyId: company.id, service, state: "solicitada", requestedAt: now, mode: adapter.mode, webhookNonceHash: hash })
      .returning({ id: rfbRequests.id });
    return { kind: "reservada" as const, requestId: row.id, nonce };
  });

  if (reserved.kind === "em_andamento") return { service, status: "em_andamento", requestId: reserved.requestId };
  if (reserved.kind === "cota") {
    await event(deps, db, {
      action: "cota_esgotada",
      entityId: `${company.id}:${service}`,
      status: "erro",
      summary: `Cota de ${label} esgotada hoje (${reserved.used} de ${limit}). Não chamei a Receita.`,
    });
    return { service, status: "cota_esgotada", used: reserved.used, limit };
  }

  const { requestId, nonce } = reserved;
  try {
    const opened = await adapter.requestConsulta(company.id, service, { urlRetorno: webhookUrl(deps.env?.APP_URL, requestId, nonce) });
    await db.update(rfbRequests).set({ ticket: opened.ticket, etaSeconds: opened.etaSeconds }).where(eq(rfbRequests.id, requestId));
    await event(deps, db, {
      action: "solicitar",
      entityId: requestId,
      status: "trabalhando",
      summary: `Pedi ${label} à Receita${modeTag(deps)}. Tíquete recebido; previsão de ${opened.etaSeconds < 0 ? "tempo não estimado" : `${opened.etaSeconds} s`}.`,
    });
    return { service, status: "aberta", requestId };
  } catch (e) {
    const code = e instanceof ReceitaError ? e.code : "FALHA_CHAMADA";
    const message = e instanceof ReceitaError ? e.message : "falha ao chamar a Receita";
    await db.update(rfbRequests).set({ state: "erro", errorCode: code, errorMessage: message }).where(eq(rfbRequests.id, requestId));
    await event(deps, db, {
      action: "solicitar",
      entityId: requestId,
      status: "erro",
      summary: `A Receita recusou o pedido de ${label} (${code}). O pedido conta na cota do dia.`,
    });
    return { service, status: "erro", requestId, code };
  }
}

export async function syncCompany(deps: ApuracaoDeps, companyId: string, services: readonly ReceitaService[] = RECEITA_SERVICES) {
  const company = await loadCompany(deps.db, companyId);
  if (!company) throw new ReceitaError("REQUISICAO_INVALIDA", "cliente desconhecido", 400);
  const now = nowOf(deps);
  const last = await lastCompleted(deps.db, [company.id], deps.adapter.mode);
  const results: OpenResult[] = [];
  for (const service of services) {
    const risk = windowRisk(last.get(`${company.id}:${service}`) ?? null, now);
    if (risk.atRisk) {
      await event(deps, deps.db, {
        action: "janela_em_risco",
        entityId: `${company.id}:${service}`,
        status: "aguardando_humano",
        summary: `Janela em risco: ${risk.days} dias sem sincronizar ${SERVICE_LABEL[service]} de ${shortName(company.name)} (a Receita só devolve os últimos 8 dias).`,
      });
    }
    results.push(await openConsulta(deps, company, service));
  }
  return { companyId: company.id, results };
}

export async function syncPortfolio(deps: ApuracaoDeps) {
  const list = await deps.db.select({ id: companies.id }).from(companies).orderBy(asc(companies.name));
  const out = [];
  for (const c of list) out.push(await syncCompany(deps, c.id));
  return out;
}

/** Transição condicional (de → para): só uma chamada concorrente vence. */
async function transition(
  db: Db,
  row: RequestRow,
  to: RequestState,
  extra: Partial<typeof rfbRequests.$inferInsert> = {},
): Promise<boolean> {
  const updated = await db
    .update(rfbRequests)
    .set({ state: to, ...extra })
    .where(and(eq(rfbRequests.id, row.id), eq(rfbRequests.state, row.state)))
    .returning({ id: rfbRequests.id });
  if (updated.length === 0) return false;
  row.state = to;
  Object.assign(row, extra);
  return true;
}

/**
 * Avança uma solicitação o quanto der: situação → download → normalização.
 * Nenhuma transação fica aberta durante chamada ao adaptador; cada passo é uma transição condicional.
 */
export async function processRequest(deps: ApuracaoDeps, requestId: string): Promise<RequestState | null> {
  const { db } = deps;
  const [row] = await db.select().from(rfbRequests).where(eq(rfbRequests.id, requestId));
  if (!row || !isOpen(row.state) || !row.ticket || row.mode !== deps.adapter.mode) return row?.state ?? null;
  const ticket = row.ticket;
  const [company] = await db
    .select({ id: companies.id, name: companies.name, cnpjRoot: companies.cnpjRoot })
    .from(companies)
    .where(eq(companies.id, row.companyId));
  const label = `${SERVICE_LABEL[row.service]} de ${shortName(company.name)}`;
  const now = nowOf(deps);
  const fail = async (to: "erro" | "expirada", code: string, message: string, summary: string) => {
    if (await transition(db, row, to, { errorCode: code, errorMessage: message })) {
      await event(deps, db, { action: to === "expirada" ? "expirar" : "falhar", entityId: row.id, status: "erro", summary });
    }
    return row.state;
  };
  const errorCode = (e: unknown, fallback: string) => (e instanceof ReceitaError ? e.code : fallback);
  const errorMessage = (e: unknown, fallback: string) => (e instanceof ReceitaError ? e.message : fallback);

  if ((row.state === "solicitada" || row.state === "em_processamento") && now.getTime() - row.requestedAt.getTime() > EXPIRE_MINUTES * 60_000) {
    return fail("expirada", "EXPIRADA", "Tempo limite de processamento excedido (240 minutos).", `A consulta de ${label} expirou depois de 240 minutos.`);
  }

  if (row.state === "solicitada" || row.state === "em_processamento") {
    let situacao;
    try {
      situacao = await deps.adapter.getSituacao(ticket);
    } catch (e) {
      const code = errorCode(e, "FALHA_SITUACAO");
      return fail("erro", code, errorMessage(e, "falha ao consultar a situação"), `Não consegui consultar a situação de ${label} (${code}).`);
    }
    if (situacao.situacao === "EM_PROCESSAMENTO" && row.state === "solicitada") {
      if (!(await transition(db, row, "em_processamento"))) return null;
      await event(deps, db, { action: "acompanhar", entityId: row.id, status: "trabalhando", summary: `A Receita está processando ${label}.` });
    } else if (situacao.situacao === "CONCLUIDA") {
      if (!(await transition(db, row, "concluida", { readyAt: now }))) return null;
      await event(deps, db, { action: "acompanhar", entityId: row.id, status: "trabalhando", summary: `A Receita concluiu ${label}. Vou baixar o arquivo.` });
    } else if (situacao.situacao === "ERRO") {
      const code = situacao.codigoErro ?? "ERRO";
      return fail("erro", code, situacao.mensagemErro ?? "erro na Receita", `A Receita devolveu erro em ${label} (${code}).`);
    } else if (situacao.situacao === "EXPIRADA") {
      return fail("expirada", situacao.codigoErro ?? "EXPIRADA", situacao.mensagemErro ?? "expirada", `A consulta de ${label} expirou na Receita.`);
    }
  }

  if (row.state === "concluida") {
    try {
      const file = await deps.adapter.download(ticket);
      const stored = await storeRawFile(db, row.id, piiHashKey(deps.env ?? process.env), file.raw);
      if (!(await transition(db, row, "baixada", { downloadedAt: now }))) return null;
      await event(deps, db, {
        action: "baixar",
        entityId: row.id,
        status: "trabalhando",
        summary: `Baixei o arquivo de ${label} (sha256 ${stored.sha256.slice(0, 12)}…).`,
      });
    } catch (e) {
      const code = errorCode(e, "FALHA_DOWNLOAD");
      return fail(code === "URL_ASSINADA_EXPIRADA" ? "expirada" : "erro", code, errorMessage(e, "falha no download"), `Não consegui baixar o arquivo de ${label} (${code}).`);
    }
  }

  if (row.state === "baixada") {
    const [raw] = await db
      .select({ payload: sql<string>`${rfbRawFiles.payload}::text` })
      .from(rfbRawFiles)
      .where(eq(rfbRawFiles.requestId, row.id))
      .orderBy(desc(rfbRawFiles.receivedAt))
      .limit(1);
    try {
      const minutes = await syncMinutes(db);
      await db.transaction(async (tx) => {
        if (!(await transition(tx, row, "normalizada"))) return;
        const result = await normalizeFile(tx, { companyId: company.id, cnpjRoot: company.cnpjRoot, service: row.service, raw: raw.payload });
        await event(deps, tx, {
          action: "normalizar",
          entityId: row.id,
          status: "feito",
          summary: `Organizei ${result.rows} ${result.rows === 1 ? "registro" : "registros"} de ${label}${modeTag(deps)}: ${result.inserted} novos, ${result.updated} atualizados.`,
          count: result.rows,
          minutesSaved: minutes,
        });
      });
    } catch (e) {
      if (!(e instanceof ReceitaFileError)) throw e;
      row.state = "baixada";
      return fail("erro", "ARQUIVO_INVALIDO", e.message, `O arquivo de ${label} veio fora do contrato: ${e.message}.`);
    }
  }
  return row.state;
}

/** Avança todas as solicitações em aberto (de um cliente ou da carteira). */
export async function pollRequests(deps: ApuracaoDeps, filter: { companyId?: string | null } = {}) {
  await abandonStaleReservations(deps.db, { companyId: filter.companyId }, nowOf(deps));
  const open = await deps.db
    .select({ id: rfbRequests.id })
    .from(rfbRequests)
    .where(
      and(
        inArray(rfbRequests.state, [...OPEN_STATES]),
        eq(rfbRequests.mode, deps.adapter.mode),
        filter.companyId ? eq(rfbRequests.companyId, filter.companyId) : undefined,
      ),
    )
    .orderBy(asc(rfbRequests.requestedAt));
  let processed = 0;
  for (const r of open) {
    await processRequest(deps, r.id);
    processed++;
  }
  const rad = processed > 0 ? await confirmRadPayments({ db: deps.db, env: deps.env, now: deps.now }, filter.companyId ?? null) : null;
  return { processed, rad };
}

async function lastCompleted(db: Db, companyIds: string[], mode: Mode): Promise<Map<string, Date>> {
  if (companyIds.length === 0) return new Map();
  const rows = await db
    .select({ companyId: rfbRequests.companyId, service: rfbRequests.service, at: sql<string>`max(${rfbRequests.readyAt})::text` })
    .from(rfbRequests)
    .where(and(eq(rfbRequests.state, "normalizada"), eq(rfbRequests.mode, mode), inArray(rfbRequests.companyId, companyIds)))
    .groupBy(rfbRequests.companyId, rfbRequests.service);
  return new Map(rows.filter((r) => r.at).map((r) => [`${r.companyId}:${r.service}`, new Date(r.at)]));
}

export interface ServiceStatus {
  service: ReceitaService;
  requestId: string | null;
  state: RequestState | null;
  requestedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  quotaUsed: number;
  quotaLimit: number;
  lastCompletedAt: string | null;
  windowDays: number | null;
  windowAtRisk: boolean;
}

export interface CompanySyncStatus {
  id: string;
  name: string;
  services: ServiceStatus[];
  counts: { debits: number; credits: number; payments: number };
}

export interface SyncOverview {
  mode: Mode;
  generatedAt: string;
  open: number;
  companies: CompanySyncStatus[];
}

/** Estado de cada cliente para a tela Sincronização. */
export async function syncOverview(db: Db, options: { companyId?: string | null; env?: Env; now?: Date } = {}): Promise<SyncOverview> {
  const now = options.now ?? new Date();
  const limit = dailyLimit(options.env);
  const mode = receitaMode(options.env);
  const list = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(options.companyId ? eq(companies.id, options.companyId) : undefined)
    .orderBy(asc(companies.name));
  const ids = list.map((c) => c.id);
  if (ids.length === 0) return { mode: receitaMode(options.env), generatedAt: now.toISOString(), open: 0, companies: [] };

  const latest = await db
    .selectDistinctOn([rfbRequests.companyId, rfbRequests.service])
    .from(rfbRequests)
    .where(and(inArray(rfbRequests.companyId, ids), eq(rfbRequests.mode, mode)))
    .orderBy(rfbRequests.companyId, rfbRequests.service, desc(rfbRequests.requestedAt));
  const { start, end } = brasiliaDayBounds(now);
  const quota = await db
    .select({ companyId: rfbRequests.companyId, service: rfbRequests.service, n: sql<number>`count(*)`.mapWith(Number) })
    .from(rfbRequests)
    .where(and(inArray(rfbRequests.companyId, ids), eq(rfbRequests.mode, mode), gte(rfbRequests.requestedAt, start), lt(rfbRequests.requestedAt, end)))
    .groupBy(rfbRequests.companyId, rfbRequests.service);
  const last = await lastCompleted(db, ids, mode);
  const countBy = async (table: typeof rfbDebits | typeof rfbCredits | typeof rfbPayments) => {
    const rows = await db
      .select({ companyId: table.companyId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(table)
      .where(inArray(table.companyId, ids))
      .groupBy(table.companyId);
    return new Map(rows.map((r) => [r.companyId, r.n]));
  };
  const [debits, credits, payments] = [await countBy(rfbDebits), await countBy(rfbCredits), await countBy(rfbPayments)];

  const latestBy = new Map(latest.map((r) => [`${r.companyId}:${r.service}`, r]));
  const quotaBy = new Map(quota.map((q) => [`${q.companyId}:${q.service}`, q.n]));
  let open = 0;
  const result = list.map((c) => ({
    id: c.id,
    name: c.name,
    counts: { debits: debits.get(c.id) ?? 0, credits: credits.get(c.id) ?? 0, payments: payments.get(c.id) ?? 0 },
    services: RECEITA_SERVICES.map((service): ServiceStatus => {
      const key = `${c.id}:${service}`;
      const r = latestBy.get(key);
      if (r && isOpen(r.state)) open++;
      const lastAt = last.get(key) ?? null;
      const risk = windowRisk(lastAt, now);
      return {
        service,
        requestId: r?.id ?? null,
        state: r?.state ?? null,
        requestedAt: r?.requestedAt.toISOString() ?? null,
        errorCode: r?.errorCode ?? null,
        errorMessage: r?.errorMessage ?? null,
        quotaUsed: quotaBy.get(key) ?? 0,
        quotaLimit: limit,
        lastCompletedAt: lastAt?.toISOString() ?? null,
        windowDays: risk.days,
        windowAtRisk: risk.atRisk,
      };
    }),
  }));
  return { mode: receitaMode(options.env), generatedAt: now.toISOString(), open, companies: result };
}

