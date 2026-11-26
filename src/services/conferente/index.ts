// Conferente (docs/04, docs/09): refaz o status de cada item do zero, lendo `rfb_raw_files` e `invoices`.
// Implementação própria, de propósito sem importar `conciliacao/`: quem confere não reaproveita o trabalho de quem fez.
import { and, eq, sql } from "drizzle-orm";
import { companies, invoices, reconciliationItems, rfbRawFiles, rfbRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { businessToday } from "@/lib/clock";
import { isSimulado, receitaMode, type Env } from "@/lib/config";
import { brasiliaDay, daysBetween } from "@/lib/dates";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";

export const CONFERENTE_WINDOW_DAYS = 8;

type Kind = "debito" | "credito";
type Status = (typeof reconciliationItems.$inferSelect)["status"];

export interface Expected {
  status: Status;
  diffCents: bigint | null;
}

export interface ReviewFinding {
  itemId: string;
  companyId: string;
  accessKey: string;
  period: string;
  kind: Kind;
  recorded: Expected;
  recomputed: Expected | null;
}

export interface ReviewResult {
  checked: number;
  total: number;
  ok: number;
  divergent: ReviewFinding[];
  summary: string;
}

export interface ConferenteDeps {
  db: Db;
  env?: Env;
  now?: Date;
  runId?: string | null;
}

/** Valor da Receita (`number 18,2`) direto do texto do JSON, em centavos, sem passar por float. */
export function textToCents(text: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new Error(`Conferente: valor fora do formato 18,2: ${text}`);
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

type Json = string | { [k: string]: Json } | Json[] | boolean | null;

/** JSON.parse que devolve cada número como o texto original (mantém os centavos exatos). */
function parseKeepingNumbers(text: string): Json {
  return JSON.parse(text, (_key, value, context?: { source?: string }) =>
    typeof value === "number" ? (context?.source ?? String(value)) : value,
  ) as Json;
}

const field = (o: Json | undefined, k: string): Json | undefined =>
  o && typeof o === "object" && !Array.isArray(o) ? o[k] : undefined;
const money = (v: Json | undefined): bigint => (typeof v === "string" ? textToCents(v) : 0n);
const list = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);

interface RawLine {
  accessKey: string;
  period: string;
  origin: number;
  updatedAt: string;
  apuradoCents: bigint;
  blocked: boolean;
}

/** `pa` da Receita ("10/2026") já é o formato de `invoices.period`. */
function periodFromPa(pa: string): string {
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(pa)) throw new Error(`Conferente: período inválido: ${pa}`);
  return pa;
}

function readLines(payloadText: string, kind: Kind): RawLine[] {
  const root = parseKeepingNumbers(payloadText);
  const out: RawLine[] = [];
  for (const group of list(field(root, "apuracao"))) {
    const period = periodFromPa(String(field(group, "pa")));
    for (const doc of list(field(group, kind === "debito" ? "debitos" : "creditos"))) {
      const cbs = field(doc, "cbs");
      const origin = Number(field(doc, "origem"));
      let blocked: bigint;
      if (kind === "debito") {
        blocked = money(field(cbs, "suspenso")) + money(field(cbs, "inexigivel"));
      } else {
        const ap = field(cbs, "apropriacao");
        blocked = money(field(ap, "suspenso")) + money(field(ap, "inapropriavel")) + money(field(ap, "prescrito"));
      }
      out.push({
        accessKey: String(field(doc, "chave")),
        period,
        origin,
        updatedAt: String(field(doc, "atualizacao")),
        apuradoCents: money(field(cbs, "apurado")),
        blocked: blocked > 0n || origin !== 0,
      });
    }
  }
  return out;
}

const SERVICE: Record<Kind, "debitos" | "creditos"> = { debito: "debitos", credito: "creditos" };
const itemKey = (accessKey: string, period: string, kind: Kind) => `${kind}|${accessKey}|${period}`;

interface CompanyView {
  referenceDay: Record<Kind, string | null>;
  receita: Map<string, { apuradoCents: bigint; blocked: boolean }>;
  notes: Map<string, { cbsCents: bigint; issuedOn: string }>;
}

async function loadCompany(db: Db, companyId: string, env: Env, now: Date): Promise<CompanyView> {
  const mode = receitaMode(env);
  const files = await db
    .select({
      service: rfbRequests.service,
      payload: sql<string>`${rfbRawFiles.payload}::text`,
      at: sql<string>`coalesce(${rfbRequests.readyAt}, ${rfbRequests.requestedAt})::text`,
    })
    .from(rfbRawFiles)
    .innerJoin(rfbRequests, eq(rfbRequests.id, rfbRawFiles.requestId))
    .where(and(eq(rfbRequests.companyId, companyId), eq(rfbRequests.state, "normalizada"), eq(rfbRequests.mode, mode)))
    .orderBy(rfbRawFiles.receivedAt);

  const referenceDay: Record<Kind, string | null> = { debito: null, credito: null };
  // Mesma linha (chave, período, origem) em vários arquivos: vale a de `atualizacao` mais recente.
  const latest = new Map<string, RawLine & { kind: Kind }>();
  for (const kind of ["debito", "credito"] as const) {
    const mine = files.filter((f) => f.service === SERVICE[kind]);
    if (mine.length === 0) continue;
    const lastAt = mine.map((f) => new Date(f.at)).reduce((a, b) => (a > b ? a : b));
    referenceDay[kind] = isSimulado(env) ? businessToday(env, now) : brasiliaDay(lastAt);
    for (const f of mine) {
      for (const line of readLines(f.payload, kind)) {
        const k = `${itemKey(line.accessKey, line.period, kind)}|${line.origin}`;
        const prev = latest.get(k);
        if (!prev || Date.parse(line.updatedAt) >= Date.parse(prev.updatedAt)) latest.set(k, { ...line, kind });
      }
    }
  }
  const receita = new Map<string, { apuradoCents: bigint; blocked: boolean }>();
  for (const l of latest.values()) {
    const k = itemKey(l.accessKey, l.period, l.kind);
    const sum = receita.get(k) ?? { apuradoCents: 0n, blocked: false };
    sum.apuradoCents += l.apuradoCents;
    sum.blocked ||= l.blocked;
    receita.set(k, sum);
  }

  const notes = new Map<string, { cbsCents: bigint; issuedOn: string }>();
  const rows = await db
    .select({ accessKey: invoices.accessKey, period: invoices.period, direction: invoices.direction, issuedAt: invoices.issuedAt, cbsCents: invoices.cbsCents })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));
  for (const r of rows) {
    const kind: Kind = r.direction === "venda" ? "debito" : "credito";
    notes.set(itemKey(r.accessKey, r.period, kind), { cbsCents: r.cbsCents, issuedOn: brasiliaDay(r.issuedAt) });
  }
  return { referenceDay, receita, notes };
}

/** Status esperado de uma chave, recalculado do zero (docs/04, ordem R05 → R03/R04 → R02 → R06 → R01). */
export function expectedStatus(view: CompanyView, key: string, kind: Kind): Expected | null {
  const ref = view.referenceDay[kind];
  if (!ref) return null;
  const note = view.notes.get(key);
  const rfb = view.receita.get(key);
  if (!note && !rfb) return null;
  if (!note) return { status: "so_na_receita", diffCents: null };
  if (!rfb) {
    return { status: daysBetween(note.issuedOn, ref) > CONFERENTE_WINDOW_DAYS ? "so_na_nota" : "aguardando_janela", diffCents: null };
  }
  const diff = rfb.apuradoCents - note.cbsCents;
  if (diff !== 0n) return { status: "divergente_valor", diffCents: diff };
  return { status: rfb.blocked ? "atencao" : "conciliado", diffCents: 0n };
}

const same = (a: Expected, b: Expected | null) => b !== null && a.status === b.status && (a.diffCents ?? null) === (b.diffCents ?? null);
const fmt = (n: number) => n.toLocaleString("pt-BR");

export function reviewSummary(checked: number, total: number, divergent: number): string {
  const head = `Conferi ${fmt(checked)} de ${fmt(total)}.`;
  if (divergent === 0) return `${head} Nenhuma diferença.`;
  return `${head} ${fmt(divergent)} ${divergent === 1 ? "diferença: o item ficou" : "diferenças: os itens ficaram"} para o contador olhar.`;
}

/** Confere todos os itens da carteira. Só marca `review_status`; nunca muda status, valores nem explicação. */
export async function reviewPortfolio(deps: ConferenteDeps): Promise<ReviewResult> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const companyRows = await db.select({ id: companies.id }).from(companies);
  const divergent: ReviewFinding[] = [];
  let total = 0;
  let checked = 0;
  for (const c of companyRows) {
    const view = await loadCompany(db, c.id, env, now);
    const items = await db.select().from(reconciliationItems).where(eq(reconciliationItems.companyId, c.id));
    for (const it of items) {
      total++;
      const recorded: Expected = { status: it.status, diffCents: it.diffCents };
      const recomputed = expectedStatus(view, itemKey(it.accessKey, it.period, it.kind), it.kind);
      checked++;
      const ok = same(recorded, recomputed);
      const note = ok
        ? null
        : `Conciliador: ${recorded.status}${recorded.diffCents !== null ? ` (diferença ${recorded.diffCents} centavos)` : ""}; Conferente: ${
            recomputed ? `${recomputed.status}${recomputed.diffCents !== null ? ` (diferença ${recomputed.diffCents} centavos)` : ""}` : "sem item na Receita nem nota"
          }.`;
      await db
        .update(reconciliationItems)
        .set({ reviewStatus: ok ? "revisado_ok" : "revisado_divergente", reviewedAt: now, reviewNote: note })
        .where(eq(reconciliationItems.id, it.id));
      if (ok) continue;
      const finding: ReviewFinding = { itemId: it.id, companyId: c.id, accessKey: it.accessKey, period: it.period, kind: it.kind, recorded, recomputed };
      divergent.push(finding);
      await recordAgentEvent(db, {
        runId: deps.runId ?? null,
        agent: "conferente",
        action: "conferiu_item",
        entity: "reconciliation_item",
        entityId: it.id,
        status: "revisado_divergente",
        summary: "Recalculei este item do zero e o resultado não bate com o do Conciliador: fica para o contador olhar.",
        count: 1,
        minutesSaved: 0,
      });
      await recordAudit(db, {
        actor: "agente:conferente",
        action: "conferente.divergencia",
        entity: "reconciliation_item",
        entityId: it.id,
        result: "revisado_divergente",
        details: { registrado: recorded.status, recalculado: recomputed?.status ?? null },
      });
    }
  }
  const summary = reviewSummary(checked, total, divergent.length);
  await recordAgentEvent(db, {
    runId: deps.runId ?? null,
    agent: "conferente",
    action: "conferiu_carteira",
    entity: "reconciliation_items",
    entityId: null,
    status: divergent.length === 0 ? "revisado_ok" : "revisado_divergente",
    summary,
    count: checked,
    minutesSaved: 0,
  });
  return { checked, total, ok: checked - divergent.length, divergent, summary };
}
