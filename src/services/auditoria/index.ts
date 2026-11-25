// Trilha de auditoria append-only (regra 9). Só insere e lista; o banco bloqueia UPDATE/DELETE.
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Db } from "@/db/types";

/** "usuario:<id>" | "agente:<nome>" | "sistema:<origem>" */
export type Actor = `usuario:${string}` | `agente:${string}` | `sistema:${string}`;
export type ActorKind = "humano" | "agente" | "sistema";

export interface AuditEntry {
  actor: Actor | string;
  action: string;
  entity: string;
  entityId?: string | null;
  result: string;
  details?: Record<string, unknown>;
  at?: Date;
}

const SENSITIVE_KEY = /secret|token|senha|password|authorization|api[_-]?key|assinad|signature|cookie|nonce/i;

/** Remove chaves sensíveis e converte bigint para texto (jsonb não guarda bigint). */
export function sanitizeDetails(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeDetails);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[omitido]" : sanitizeDetails(v);
    }
    return out;
  }
  return value;
}

const ACTOR_RE = /^(usuario|agente|sistema):[^\s]+$/;

export async function recordAudit(db: Db, entry: AuditEntry) {
  if (!ACTOR_RE.test(entry.actor)) throw new Error(`Ator de auditoria inválido: ${entry.actor}`);
  const [row] = await db
    .insert(auditLog)
    .values({
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      result: entry.result,
      details: (entry.details ? sanitizeDetails(entry.details) : null) as Record<string, unknown> | null,
      ...(entry.at ? { at: entry.at } : {}),
    })
    .returning();
  return row;
}

export function actorKind(actor: string): ActorKind {
  if (actor.startsWith("usuario:")) return "humano";
  if (actor.startsWith("agente:")) return "agente";
  return "sistema";
}

const KIND_PREFIX: Record<ActorKind, string> = { humano: "usuario:%", agente: "agente:%", sistema: "sistema:%" };

export async function listAudit(db: Db, filter: { kind?: ActorKind; action?: string; limit?: number } = {}) {
  const conditions: SQL[] = [];
  if (filter.kind) conditions.push(like(auditLog.actor, KIND_PREFIX[filter.kind]));
  if (filter.action) conditions.push(eq(auditLog.action, filter.action));
  return db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(filter.limit ?? 200);
}
