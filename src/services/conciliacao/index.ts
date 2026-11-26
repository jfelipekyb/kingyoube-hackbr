// Agente Conciliador (docs/04): nota × Receita por (empresa, chave, período), R01–R06, sem duplicar itens.
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { companies, effortStandards, invoices, reconciliationItems, rfbCredits, rfbDebits, rfbRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { businessToday } from "@/lib/clock";
import { isSimulado, receitaMode, type Env } from "@/lib/config";
import { brasiliaDay, daysBetween } from "@/lib/dates";
import { recordAgentEvent } from "@/services/equipe";
import { explain, llmRewriter, type ExplanationFacts, type Rewriter } from "@/services/explicacao";
import { CONTRACT_VERSION } from "@/services/receita/contract";
import { classify, keyOf, type InvoiceFact, type ItemDraft, type ItemKind, type ReceitaLine } from "./rules";

export * from "./rules";

export interface ConciliacaoDeps {
  db: Db;
  env?: Env;
  now?: Date;
  runId?: string | null;
  /** `undefined` = usa a LLM se ANTHROPIC_API_KEY e LLM_MODEL existirem; `null` = só o modelo fixo. */
  rewriter?: Rewriter | null;
  /** Na rodada da equipe o Analista registra a própria entrega, em chamada separada (docs/09). */
  skipAnalystEvent?: boolean;
}

export interface ReconcileResult {
  companyId: string;
  total: number;
  byStatus: Record<ItemDraft["status"], number>;
  explained: number;
  rewritten: number;
}

const SERVICE_OF: Record<ItemKind, "debitos" | "creditos"> = { debito: "debitos", credito: "creditos" };
const emptyStatus = (): ReconcileResult["byStatus"] => ({
  conciliado: 0,
  atencao: 0,
  divergente_valor: 0,
  aguardando_janela: 0,
  so_na_nota: 0,
  so_na_receita: 0,
});

/** Dia da última sincronização concluída (normalizada) de cada tipo; em SIMULADO o relógio é DEMO_TODAY. */
async function referenceDays(db: Db, companyId: string, env: Env, now: Date): Promise<Record<ItemKind, string | null>> {
  const rows = await db
    .select({ service: rfbRequests.service, last: sql<Date | null>`max(coalesce(${rfbRequests.readyAt}, ${rfbRequests.requestedAt}))`.mapWith((v) => (v ? new Date(v) : null)) })
    .from(rfbRequests)
    .where(and(eq(rfbRequests.companyId, companyId), eq(rfbRequests.state, "normalizada"), eq(rfbRequests.mode, receitaMode(env))))
    .groupBy(rfbRequests.service);
  const last = new Map(rows.map((r) => [r.service, r.last]));
  const day = (kind: ItemKind) => {
    const at = last.get(SERVICE_OF[kind]);
    if (!at) return null;
    return isSimulado(env) ? businessToday(env, now) : brasiliaDay(at);
  };
  return { debito: day("debito"), credito: day("credito") };
}

interface Detail {
  blocked: { label: string; cents: bigint }[];
  otherOrigin: boolean;
}

function addBlocked(d: Detail, label: string, cents: bigint) {
  if (cents <= 0n) return;
  const found = d.blocked.find((b) => b.label === label);
  if (found) found.cents += cents;
  else d.blocked.push({ label, cents });
}

async function loadReceita(db: Db, companyId: string, period?: string) {
  const lines: ReceitaLine[] = [];
  const details = new Map<string, Detail>();
  const detail = (k: string) => details.get(k) ?? (details.set(k, { blocked: [], otherOrigin: false }), details.get(k)!);
  const debitWhere = period ? and(eq(rfbDebits.companyId, companyId), eq(rfbDebits.period, period)) : eq(rfbDebits.companyId, companyId);
  for (const r of await db.select().from(rfbDebits).where(debitWhere)) {
    const line: ReceitaLine = { accessKey: r.accessKey, period: r.period, kind: "debito", origin: r.origin, apuradoCents: r.apuradoCents, blockedCents: r.suspensoCents + r.inexigivelCents };
    lines.push(line);
    const d = detail(keyOf(line));
    addBlocked(d, "suspenso", r.suspensoCents);
    addBlocked(d, "inexigível", r.inexigivelCents);
    d.otherOrigin ||= r.origin !== 0;
  }
  const creditWhere = period ? and(eq(rfbCredits.companyId, companyId), eq(rfbCredits.period, period)) : eq(rfbCredits.companyId, companyId);
  for (const r of await db.select().from(rfbCredits).where(creditWhere)) {
    const line: ReceitaLine = {
      accessKey: r.accessKey,
      period: r.period,
      kind: "credito",
      origin: r.origin,
      apuradoCents: r.apuradoCents,
      blockedCents: r.suspensoCents + r.inapropriavelCents + r.prescritoCents,
    };
    lines.push(line);
    const d = detail(keyOf(line));
    addBlocked(d, "suspenso", r.suspensoCents);
    addBlocked(d, "inapropriável", r.inapropriavelCents);
    addBlocked(d, "prescrito", r.prescritoCents);
    d.otherOrigin ||= r.origin !== 0;
  }
  return { lines, details };
}

async function minutesFor(db: Db, task: string): Promise<number> {
  const [row] = await db.select({ minutes: effortStandards.minutes }).from(effortStandards).where(eq(effortStandards.task, task));
  return row?.minutes ?? 0;
}

const shortName = (name: string) => name.replace(/\s*\(FICTÍCIA\)$/, "");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

async function reconcileOne(deps: ConciliacaoDeps, companyId: string, period: string | undefined, rewriter: Rewriter | null): Promise<ReconcileResult> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const ref = await referenceDays(db, companyId, env, now);
  const invWhere = period ? and(eq(invoices.companyId, companyId), eq(invoices.period, period)) : eq(invoices.companyId, companyId);
  const invRows = await db
    .select({ id: invoices.id, accessKey: invoices.accessKey, period: invoices.period, direction: invoices.direction, issuedAt: invoices.issuedAt, cbsCents: invoices.cbsCents })
    .from(invoices)
    .where(invWhere);
  const facts: InvoiceFact[] = invRows.map((r) => ({
    id: r.id,
    accessKey: r.accessKey,
    period: r.period,
    kind: r.direction === "venda" ? "debito" : "credito",
    issuedOn: brasiliaDay(r.issuedAt),
    cbsCents: r.cbsCents,
  }));
  const issuedOn = new Map(facts.map((f) => [keyOf(f), f.issuedOn]));
  const { lines, details } = await loadReceita(db, companyId, period);
  const drafts = classify({ invoices: facts, receita: lines, referenceDay: ref });

  const result: ReconcileResult = { companyId, total: drafts.length, byStatus: emptyStatus(), explained: 0, rewritten: 0 };
  const rows: (typeof reconciliationItems.$inferInsert)[] = [];
  for (const d of drafts) {
    result.byStatus[d.status]++;
    const k = keyOf(d);
    const det = details.get(k) ?? { blocked: [], otherOrigin: false };
    const issued = issuedOn.get(k) ?? null;
    const referenceDay = ref[d.kind]!;
    const f: ExplanationFacts = {
      ruleId: d.ruleId,
      kind: d.kind,
      period: d.period,
      invoiceCents: d.invoiceCents,
      rfbCents: d.rfbCents,
      diffCents: d.diffCents,
      issuedOn: issued,
      referenceDay,
      daysSinceIssue: issued ? daysBetween(issued, referenceDay) : null,
      blocked: det.blocked,
      otherOrigin: det.otherOrigin,
    };
    const text = await explain(f, d.status === "conciliado" ? null : rewriter);
    if (d.status !== "conciliado") result.explained++;
    if (text.rewritten) result.rewritten++;
    rows.push({
      companyId,
      invoiceId: d.invoiceId,
      accessKey: d.accessKey,
      period: d.period,
      kind: d.kind,
      status: d.status,
      invoiceCents: d.invoiceCents,
      rfbCents: d.rfbCents,
      diffCents: d.diffCents,
      ruleId: d.ruleId,
      explanation: text.explanation,
      explanationOriginal: text.original,
      computedAt: now,
      contractVersion: CONTRACT_VERSION[SERVICE_OF[d.kind]],
    });
  }

  const scope = period ? and(eq(reconciliationItems.companyId, companyId), eq(reconciliationItems.period, period)) : eq(reconciliationItems.companyId, companyId);
  const keep = rows.map((r) => `${r.kind}|${r.accessKey}|${r.period}`);
  const stale = sql`(${reconciliationItems.kind}::text || '|' || ${reconciliationItems.accessKey} || '|' || ${reconciliationItems.period})`;
  await db.delete(reconciliationItems).where(keep.length ? and(scope, notInArray(stale, keep)) : scope);
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(reconciliationItems)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [reconciliationItems.companyId, reconciliationItems.accessKey, reconciliationItems.period, reconciliationItems.kind],
        set: {
          invoiceId: sql`excluded.invoice_id`,
          status: sql`excluded.status`,
          invoiceCents: sql`excluded.invoice_cents`,
          rfbCents: sql`excluded.rfb_cents`,
          diffCents: sql`excluded.diff_cents`,
          ruleId: sql`excluded.rule_id`,
          explanation: sql`excluded.explanation`,
          explanationOriginal: sql`excluded.explanation_original`,
          computedAt: sql`excluded.computed_at`,
          contractVersion: sql`excluded.contract_version`,
          reviewStatus: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });
  }
  return result;
}

function sumResults(companyId: string, results: ReconcileResult[]): ReconcileResult {
  const out: ReconcileResult = { companyId, total: 0, byStatus: emptyStatus(), explained: 0, rewritten: 0 };
  for (const r of results) {
    out.total += r.total;
    out.explained += r.explained;
    out.rewritten += r.rewritten;
    for (const s of Object.keys(out.byStatus) as ItemDraft["status"][]) out.byStatus[s] += r.byStatus[s];
  }
  return out;
}

async function recordEvents(deps: ConciliacaoDeps, entity: string, entityId: string | null, who: string, r: ReconcileResult) {
  const attention = r.total - r.byStatus.conciliado;
  await recordAgentEvent(deps.db, {
    runId: deps.runId ?? null,
    agent: "conciliador",
    action: "conciliar",
    entity,
    entityId,
    status: "feito",
    summary: `Conciliei ${plural(r.total, "item", "itens")}${who}: ${plural(r.byStatus.conciliado, "conciliado", "conciliados")}, ${attention.toLocaleString("pt-BR")} ${attention === 1 ? "pede" : "pedem"} olhar.`,
    count: r.total,
    minutesSaved: r.total * (await minutesFor(deps.db, "conferir_nota")),
  });
  if (deps.skipAnalystEvent) return;
  const llm = r.rewritten > 0 ? ` (${r.rewritten} com texto reescrito pelo modelo de linguagem, números conferidos)` : "";
  await recordAgentEvent(deps.db, {
    runId: deps.runId ?? null,
    agent: "analista",
    action: "explicar",
    entity,
    entityId,
    status: "feito",
    summary: `Expliquei ${plural(r.explained, "item", "itens")}${who}${llm}.`,
    count: r.explained,
    minutesSaved: r.explained * (await minutesFor(deps.db, "investigar_divergencia")),
  });
}

const resolveRewriter = (deps: ConciliacaoDeps) => (deps.rewriter === undefined ? llmRewriter(deps.env ?? process.env) : deps.rewriter);

export async function reconcile(deps: ConciliacaoDeps, companyId: string, period?: string): Promise<ReconcileResult> {
  const [company] = await deps.db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
  if (!company) throw new Error("Cliente não encontrado");
  const r = await reconcileOne(deps, companyId, period, resolveRewriter(deps));
  await recordEvents(deps, "company", companyId, ` de ${shortName(company.name)}`, r);
  return r;
}

export async function reconcilePortfolio(deps: ConciliacaoDeps): Promise<{ total: ReconcileResult; companies: ReconcileResult[] }> {
  const rewriter = resolveRewriter(deps);
  const list = await deps.db.select({ id: companies.id }).from(companies).orderBy(asc(companies.name));
  const results: ReconcileResult[] = [];
  for (const c of list) results.push(await reconcileOne(deps, c.id, undefined, rewriter));
  const total = sumResults("carteira", results);
  await recordEvents(deps, "carteira", null, "", total);
  return { total, companies: results };
}

