// Visão da rodada para a Sala da Equipe e para GET /api/equipe/run/[runId]. Sem bigint: valores já formatados.
import { eq } from "drizzle-orm";
import { companies, reconciliationItems, type RunStepState } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatBRL } from "@/lib/money";
import { radCandidates } from "@/services/carteira/metrics";
import { hoursFromCounts, listStandards } from "./hours";
import { getRun, ROUND_AGENTS, runTimeline, type RoundAgent } from "./run";

export interface Decision {
  kind: "rad" | "divergencia" | "conferente";
  title: string;
  detail: string;
  href: string;
}

const shortName = (name: string) => name.replace(/\s*\(FICTÍCI[AO]\)$/, "");

/** O que espera o contador: guias de RAD sem decisão, divergências de valor e itens que o Conferente apontou. */
export async function pendingDecisions(db: Db): Promise<Decision[]> {
  const names = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies)).map((c) => [c.id, shortName(c.name)]));
  const out: Decision[] = [];
  for (const c of (await radCandidates(db)).filter((x) => !x.hasDecision)) {
    out.push({ kind: "rad", title: `Guia de recolhimento (RAD) — ${names.get(c.companyId) ?? "cliente"}`, detail: `Crédito travado de ${formatBRL(c.lockedCents)}. Só sai com a sua aprovação.`, href: `/rad?cliente=${c.companyId}` });
  }
  const items = await db
    .select({ id: reconciliationItems.id, companyId: reconciliationItems.companyId, diffCents: reconciliationItems.diffCents })
    .from(reconciliationItems)
    .where(eq(reconciliationItems.status, "divergente_valor"));
  for (const i of items) {
    out.push({ kind: "divergencia", title: `Divergência de valor — ${names.get(i.companyId) ?? "cliente"}`, detail: `Diferença de ${formatBRL(i.diffCents ?? 0n)} entre a nota e a Receita.`, href: `/conciliacao/${i.id}` });
  }
  const flagged = await db.select({ id: reconciliationItems.id, companyId: reconciliationItems.companyId }).from(reconciliationItems).where(eq(reconciliationItems.reviewStatus, "revisado_divergente"));
  for (const f of flagged) {
    out.push({ kind: "conferente", title: `Item apontado pelo Conferente — ${names.get(f.companyId) ?? "cliente"}`, detail: "O recálculo independente não bateu com a conciliação. Olhe antes de decidir.", href: `/conciliacao/${f.id}` });
  }
  return out;
}

export interface RunSnapshot {
  run: { id: string; status: string; startedAt: string; finishedAt: string | null };
  steps: Record<RoundAgent, RunStepState | null>;
  timeline: { id: string; at: string; agent: string; status: string; summary: string }[];
  hours: { minutes: number; hours: number; lines: { task: string; label: string; count: number; minutesEach: number; minutes: number }[] };
  decisions: Decision[] | null;
}

export async function runSnapshot(db: Db, runId: string): Promise<RunSnapshot | null> {
  const run = await getRun(db, runId);
  if (!run) return null;
  const standards = await listStandards(db);
  const timeline = await runTimeline(db, run);
  return {
    run: { id: run.id, status: run.status, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null },
    steps: Object.fromEntries(ROUND_AGENTS.map((a) => [a, stripCursor(run.steps[a])])) as RunSnapshot["steps"],
    timeline: timeline.map((e) => ({ ...e, at: e.at.toISOString() })),
    hours: hoursFromCounts(run.counts, standards),
    decisions: run.status === "concluida" ? await pendingDecisions(db) : null,
  };
}

function stripCursor(s: RunStepState | undefined): RunStepState | null {
  if (!s) return null;
  const { status, summary, startedAt, finishedAt } = s;
  return { status, summary, startedAt, finishedAt };
}
