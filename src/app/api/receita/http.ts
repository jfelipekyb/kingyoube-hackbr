import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isSimulado } from "@/lib/config";
import { isAuthorizedCron } from "@/services/demo";
import { createReceitaAdapter, ReceitaConfigError, type ApuracaoDeps } from "@/services/receita";

/** Em REAL, sincronizar e acompanhar exigem `Authorization: Bearer <CRON_SECRET>`; em SIMULADO a demo é pública. */
export function requireOperator(request: Request): NextResponse | null {
  if (isSimulado() || isAuthorizedCron(request.headers.get("authorization"))) return null;
  return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("corpo deve ser objeto");
  return parsed as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export function optionalCompanyId(body: Record<string, unknown>): string | null | undefined {
  const value = body.companyId;
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

/** Monta as dependências do agente; em REAL sem RFB_* devolve 503 sem chamar nada. */
export function apuracaoDeps(): ApuracaoDeps | NextResponse {
  const db = getDb();
  try {
    return { db, adapter: createReceitaAdapter(db), env: process.env };
  } catch (e) {
    if (e instanceof ReceitaConfigError) return NextResponse.json({ erro: e.message }, { status: 503 });
    throw e;
  }
}
