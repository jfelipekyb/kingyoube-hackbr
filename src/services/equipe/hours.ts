// Horas devolvidas e projeção (docs/06, docs/09). Horas = Σ (contagem × minutos-padrão) ÷ 60, com as premissas atuais.
import { asc, desc, eq } from "drizzle-orm";
import { agentRuns, effortStandards } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";

export const DEFAULT_PROJECTION_CLIENTS = 200;
export const HOURS_PER_FTE_MONTH = 168;
export const MAX_STANDARD_MINUTES = 600;

export type EffortStandard = typeof effortStandards.$inferSelect;

export interface HoursLine {
  task: string;
  label: string;
  count: number;
  minutesEach: number;
  minutes: number;
}

export interface HoursBreakdown {
  lines: HoursLine[];
  /** Inteiro: Σ contagem × minutos. */
  minutes: number;
  hours: number;
}

export function hoursFromCounts(counts: Record<string, number>, standards: readonly Pick<EffortStandard, "task" | "label" | "minutes">[]): HoursBreakdown {
  const lines = standards.map((s) => {
    const count = counts[s.task] ?? 0;
    return { task: s.task, label: s.label, count, minutesEach: s.minutes, minutes: count * s.minutes };
  });
  const minutes = lines.reduce((a, l) => a + l.minutes, 0);
  return { lines, minutes, hours: minutes / 60 };
}

export interface Projection {
  clients: number;
  monthlyHours: number;
  fte: number;
}

/** Projeção, não medição: (horas da última rodada ÷ clientes) × N clientes; equivalente = horas/mês ÷ 168. */
export function projectHours(lastRunHours: number, clientsInRun: number, targetClients: number = DEFAULT_PROJECTION_CLIENTS): Projection {
  if (clientsInRun <= 0) return { clients: targetClients, monthlyHours: 0, fte: 0 };
  const monthlyHours = (lastRunHours / clientsInRun) * targetClients;
  return { clients: targetClients, monthlyHours, fte: monthlyHours / HOURS_PER_FTE_MONTH };
}

export const listStandards = (db: Db) => db.select().from(effortStandards).orderBy(asc(effortStandards.task));

export interface ReturnedHours {
  standards: EffortStandard[];
  lastRun: (HoursBreakdown & { runId: string; finishedAt: Date | null }) | null;
  /** Desde o último reinício da demonstração: todas as rodadas concluídas. */
  accumulated: HoursBreakdown;
  runs: number;
}

export async function returnedHours(db: Db): Promise<ReturnedHours> {
  const standards = await listStandards(db);
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.status, "concluida")).orderBy(desc(agentRuns.finishedAt));
  const total: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
  const last = runs[0];
  return {
    standards,
    lastRun: last ? { ...hoursFromCounts(last.counts, standards), runId: last.id, finishedAt: last.finishedAt } : null,
    accumulated: hoursFromCounts(total, standards),
    runs: runs.length,
  };
}

export class PremiseError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Só o Contador muda premissa; toda mudança vai para a auditoria (de → para). A trava é aqui, não só na tela. */
export async function updateEffortStandard(db: Db, input: { task: string; minutes: number; role: string; actor: string }): Promise<EffortStandard> {
  if (input.role !== "contador") {
    await recordAudit(db, { actor: input.actor, action: "equipe.premissa", entity: "effort_standard", entityId: input.task, result: "negado", details: { motivo: "só o contador muda premissa" } });
    throw new PremiseError(403, "Só o contador pode mudar uma premissa.");
  }
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > MAX_STANDARD_MINUTES) {
    throw new PremiseError(400, `Minutos devem ser um número inteiro de 1 a ${MAX_STANDARD_MINUTES}.`);
  }
  const [before] = await db.select().from(effortStandards).where(eq(effortStandards.task, input.task));
  if (!before) throw new PremiseError(404, "Premissa não encontrada.");
  const [row] = await db
    .update(effortStandards)
    .set({ minutes: input.minutes, updatedBy: input.actor, updatedAt: new Date() })
    .where(eq(effortStandards.task, input.task))
    .returning();
  await recordAudit(db, { actor: input.actor, action: "equipe.premissa", entity: "effort_standard", entityId: input.task, result: "ok", details: { de: before.minutes, para: input.minutes } });
  return row;
}
