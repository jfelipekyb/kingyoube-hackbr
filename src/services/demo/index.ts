// Reset da base de demonstração (docs/06): cron diário protegido e botão público limitado.
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
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
export function hashIp(ip: string): string {
  return createHash("sha256").update(`demo-reiniciar:${ip}`).digest("hex");
}

export async function resetDemo(db: Db, actor: string, reason: string, env: Env = process.env): Promise<SeedCounts> {
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
  const recent = await db
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
    const retry = Math.ceil((recent[0].at.getTime() + REINICIAR_WINDOW_MS - now.getTime()) / 1000);
    await recordAudit(db, { actor: "sistema:reiniciar", action: "demo.reiniciar", entity: "base_demo", result: "limitado", details: { ipHash } });
    return { status: "limitado", retryAfterSeconds: Math.max(retry, 1) };
  }
  await recordAudit(db, { actor: "sistema:reiniciar", action: "demo.reiniciar", entity: "base_demo", result: "ok", details: { ipHash }, at: now });
  const counts = await resetDemo(db, "sistema:reiniciar", "botão público", env);
  return { status: "ok", counts };
}
