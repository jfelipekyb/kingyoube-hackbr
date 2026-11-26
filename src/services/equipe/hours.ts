// Horas devolvidas e projeção (docs/06, docs/09). Horas = Σ (contagem × minutos-padrão) ÷ 60, com as premissas atuais.
import { asc, desc, eq } from "drizzle-orm";
import { agentRuns, effortStandards, teamPremises, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";
import { TEAM_PREMISES } from "@/seed/effort";

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

export interface ProjectionPremises {
  roundsPerMonth: number;
  targetClients: number;
  hoursPerPersonMonth: number;
}

export const DEFAULT_PREMISES: ProjectionPremises = { roundsPerMonth: 1, targetClients: DEFAULT_PROJECTION_CLIENTS, hoursPerPersonMonth: HOURS_PER_FTE_MONTH };

/** Projeção, não medição: (horas da última rodada ÷ clientes) × N clientes × rodadas/mês; equivalente = horas/mês ÷ 168. */
export function projectHours(lastRunHours: number, clientsInRun: number, premises: Partial<ProjectionPremises> = {}): Projection {
  const p = { ...DEFAULT_PREMISES, ...premises };
  if (clientsInRun <= 0) return { clients: p.targetClients, monthlyHours: 0, fte: 0 };
  const monthlyHours = (lastRunHours / clientsInRun) * p.targetClients * p.roundsPerMonth;
  return { clients: p.targetClients, monthlyHours, fte: monthlyHours / p.hoursPerPersonMonth };
}

export type TeamPremise = typeof teamPremises.$inferSelect;
const PREMISE_KEYS = { rodadas_por_mes: "roundsPerMonth", clientes_projecao: "targetClients", horas_pessoa_mes: "hoursPerPersonMonth" } as const;
const PREMISE_LIMITS: Record<string, [number, number]> = { rodadas_por_mes: [1, 31], clientes_projecao: [1, 100_000], horas_pessoa_mes: [1, 744] };

/** Premissas da projeção; base antiga sem a tabela preenchida usa os valores de docs/06. */
export async function listPremises(db: Db): Promise<TeamPremise[]> {
  const rows = await db.select().from(teamPremises);
  return TEAM_PREMISES.map((d) => rows.find((r) => r.key === d.key) ?? { ...d, updatedBy: null, updatedAt: new Date(0) });
}

export function premisesOf(rows: readonly Pick<TeamPremise, "key" | "value">[]): ProjectionPremises {
  const out = { ...DEFAULT_PREMISES };
  for (const r of rows) {
    const k = PREMISE_KEYS[r.key as keyof typeof PREMISE_KEYS];
    if (k) out[k] = r.value;
  }
  return out;
}

export const listStandards = (db: Db) => db.select().from(effortStandards).orderBy(asc(effortStandards.task));

export interface ReturnedHours {
  standards: EffortStandard[];
  lastRun: (HoursBreakdown & { runId: string; finishedAt: Date | null }) | null;
  /** Desde o último reinício da demonstração: todas as rodadas concluídas. */
  accumulated: HoursBreakdown;
  runs: number;
  premises: TeamPremise[];
  /** Clientes na última rodada concluída. */
  clientsInRun: number;
  projection: Projection;
}

export async function returnedHours(db: Db): Promise<ReturnedHours> {
  const standards = await listStandards(db);
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.status, "concluida")).orderBy(desc(agentRuns.finishedAt));
  const total: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
  const last = runs[0];
  const lastRun = last ? { ...hoursFromCounts(last.counts, standards), runId: last.id, finishedAt: last.finishedAt } : null;
  const premises = await listPremises(db);
  const clientsInRun = last?.counts.clientes ?? 0;
  return {
    standards,
    lastRun,
    accumulated: hoursFromCounts(total, standards),
    runs: runs.length,
    premises,
    clientsInRun,
    projection: projectHours(lastRun?.hours ?? 0, clientsInRun, premisesOf(premises)),
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

async function requireContador(db: Db, actor: string, entity: string, key: string) {
  const id = /^usuario:(.+)$/.exec(actor)?.[1];
  const [user] = id ? await db.select({ role: users.role }).from(users).where(eq(users.id, id)) : [];
  if (user?.role === "contador") return;
  await recordAudit(db, { actor, action: "equipe.premissa", entity, entityId: key, result: "negado", details: { motivo: "só o contador muda premissa" } });
  throw new PremiseError(403, "Só o contador pode mudar uma premissa.");
}

function requireInt(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) throw new PremiseError(400, `O valor deve ser um número inteiro de ${min} a ${max}.`);
}

/** Só o Contador muda premissa (o papel vem da base, não do pedido); toda mudança vai para a auditoria (de → para). */
export async function updateEffortStandard(db: Db, input: { task: string; minutes: number; actor: string }): Promise<EffortStandard> {
  await requireContador(db, input.actor, "effort_standard", input.task);
  requireInt(input.minutes, 1, MAX_STANDARD_MINUTES);
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

export async function updateTeamPremise(db: Db, input: { key: string; value: number; actor: string }): Promise<TeamPremise> {
  await requireContador(db, input.actor, "team_premise", input.key);
  const def = TEAM_PREMISES.find((p) => p.key === input.key);
  if (!def) throw new PremiseError(404, "Premissa não encontrada.");
  const [min, max] = PREMISE_LIMITS[def.key];
  requireInt(input.value, min, max);
  const before = (await listPremises(db)).find((p) => p.key === def.key)!;
  const [row] = await db
    .insert(teamPremises)
    .values({ key: def.key, label: def.label, value: input.value, updatedBy: input.actor })
    .onConflictDoUpdate({ target: teamPremises.key, set: { value: input.value, updatedBy: input.actor, updatedAt: new Date() } })
    .returning();
  await recordAudit(db, { actor: input.actor, action: "equipe.premissa", entity: "team_premise", entityId: def.key, result: "ok", details: { de: before.value, para: input.value } });
  return row;
}
