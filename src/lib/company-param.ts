import "server-only";
import type { Db } from "@/db/types";
import { currentCompanyId } from "@/lib/demo-session";
import { portfolioMetrics } from "@/services/carteira/metrics";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Cliente da tela: `?cliente=`, senão o seletor do cabeçalho, senão o de maior dinheiro em risco. */
export async function resolveCompany(db: Db, param: string | string[] | undefined) {
  const metrics = await portfolioMetrics(db);
  const wanted = isUuid(param) ? param : await currentCompanyId();
  return { company: metrics.find((m) => m.id === wanted) ?? metrics[0] ?? null, metrics };
}
