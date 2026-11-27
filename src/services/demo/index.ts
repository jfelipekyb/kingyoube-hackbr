// Reset da base de demonstração (docs/06): cron diário protegido e botão público limitado.
import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Db } from "@/db/types";
import { demoToday } from "@/lib/clock";
import { isSimulado, type Env } from "@/lib/config";
import { recordAudit } from "@/services/auditoria";
import { seedDemo, type SeedCounts } from "@/seed/seed";

export const REINICIAR_WINDOW_MS = 60_000;

/** Vercel Cron envia `Authorization: Bearer <CRON_SECRET>`. Sem segredo configurado, nada passa. */
export function isAuthorizedCron(authorization: string | null, env: Env = process.env): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "desconhecido";
}

/** IP nunca vai para a base em claro (LGPD, docs/07). */
export function hashIp(ip: string, scope = "demo-reiniciar"): string {
  return createHash("sha256").update(`${scope}:${ip}`).digest("hex");
}

/**
 * Limite de `max` ações (padrão 1) por janela deslizante por IP (só o hash do IP vai para a auditoria). Devolve os segundos de espera, ou null se liberou.
 * A ação liberada fica gravada como `action` com resultado "ok"; a barrada, como "limitado".
 */
export async function limitPerIp(db: Db, input: { action: string; ip: string; windowMs?: number; max?: number; now?: Date }): Promise<number | null> {
  const now = input.now ?? new Date();
  const windowMs = input.windowMs ?? 60_000;
  const max = input.max ?? 1;
  const ipHash = hashIp(input.ip, input.action);
  const since = new Date(now.getTime() - windowMs);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ipHash}))`);
    const recent = await tx
      .select({ at: auditLog.at })
      .from(auditLog)
      .where(and(eq(auditLog.action, input.action), eq(auditLog.result, "ok"), gt(auditLog.at, since), sql`${auditLog.details}->>'ipHash' = ${ipHash}`))
      .orderBy(asc(auditLog.at))
      .limit(max);
    if (recent.length >= max) {
      await recordAudit(tx, { actor: "sistema:limite", action: input.action, entity: "limite_ip", result: "limitado", details: { ipHash } });
      return Math.max(Math.ceil((recent[0].at.getTime() + windowMs - now.getTime()) / 1000), 1);
    }
    await recordAudit(tx, { actor: "sistema:limite", action: input.action, entity: "limite_ip", result: "ok", details: { ipHash }, at: now });
    return null;
  });
}

export async function resetDemo(db: Db, actor: string, reason: string, env: Env = process.env): Promise<SeedCounts> {
  if (!isSimulado(env)) throw new Error("Reset da demonstração só roda com RECEITA_MODE=SIMULADO");
  const counts = await seedDemo(db, { demoToday: demoToday(env), appUrl: env.APP_URL, actor, reason });
  await recordAudit(db, { actor, action: "demo.reset", entity: "base_demo", result: "ok", details: { reason, ...counts } });
  return counts;
}

export type ReiniciarResult =
  | { status: "ok"; counts: SeedCounts }
  | { status: "limitado"; retryAfterSeconds: number }
  | { status: "indisponivel" };

export async function reiniciarDemo(db: Db, ip: string, env: Env = process.env, now = new Date()): Promise<ReiniciarResult> {
  if (!isSimulado(env)) return { status: "indisponivel" };
  const ipHash = hashIp(ip);
  const since = new Date(now.getTime() - REINICIAR_WINDOW_MS);
  const retryAfterSeconds = await db.transaction(async (tx) => {
    // Serializa chamadas simultâneas do mesmo IP: a segunda só lê depois que a primeira gravou.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ipHash}))`);
    const recent = await tx
      .select({ at: auditLog.at })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "demo.reiniciar"),
          eq(auditLog.result, "ok"),
          gt(auditLog.at, since),
          sql`${auditLog.details}->>'ipHash' = ${ipHash}`,
        ),
      )
      .limit(1);
    if (recent.length > 0) {
      await recordAudit(tx, { actor: "sistema:reiniciar", action: "demo.reiniciar", entity: "base_demo", result: "limitado", details: { ipHash } });
      return Math.max(Math.ceil((recent[0].at.getTime() + REINICIAR_WINDOW_MS - now.getTime()) / 1000), 1);
    }
    await recordAudit(tx, { actor: "sistema:reiniciar", action: "demo.reiniciar", entity: "base_demo", result: "ok", details: { ipHash }, at: now });
    return null;
  });
  if (retryAfterSeconds !== null) return { status: "limitado", retryAfterSeconds };
  const counts = await resetDemo(db, "sistema:reiniciar", "botão público", env);
  return { status: "ok", counts };
}
