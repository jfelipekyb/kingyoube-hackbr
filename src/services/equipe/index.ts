// Registro do que cada agente fez (regra 12). Todo evento também vai para a auditoria.
import { agentEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";
import { isAgentKey, type AgentKey } from "./agents";

export type AgentEventStatus = (typeof agentEvents.$inferInsert)["status"];

export interface AgentEventInput {
  runId?: string | null;
  agent: AgentKey;
  action: string;
  entity: string;
  entityId?: string | null;
  status: AgentEventStatus;
  summary: string;
  count?: number;
  minutesSaved?: number;
}

export async function recordAgentEvent(db: Db, input: AgentEventInput) {
  if (!isAgentKey(input.agent)) throw new Error(`Agente desconhecido: ${input.agent}`);
  if (!input.summary.trim()) throw new Error("O resumo do evento do agente é obrigatório");
  const count = input.count ?? 0;
  const minutesSaved = input.minutesSaved ?? 0;
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(minutesSaved) || minutesSaved < 0) {
    throw new Error("count e minutesSaved precisam ser inteiros não negativos");
  }
  const [event] = await db
    .insert(agentEvents)
    .values({
      runId: input.runId ?? null,
      agent: input.agent,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      status: input.status,
      summary: input.summary,
      count,
      minutesSaved,
    })
    .returning();
  await recordAudit(db, {
    actor: `agente:${input.agent}`,
    action: `agente.${input.action}`,
    entity: input.entity,
    entityId: input.entityId ?? null,
    result: input.status,
    details: { runId: input.runId ?? null, summary: input.summary, count, minutesSaved, agentEventId: event.id },
  });
  return event;
}
