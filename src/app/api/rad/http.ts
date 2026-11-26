import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { RadError } from "@/services/rad";
import { isSimulado } from "@/lib/config";
import { clientIp, limitPerIp } from "@/services/demo";
import { optionalCompanyId, readJson } from "../receita/http";

export { requireOperator } from "../receita/http";

/** Reenvio de e-mail em SIMULADO: 1 por minuto por IP (em REAL a rota já exige Bearer CRON_SECRET). */
export async function limitEmailResend(request: Request, action: string): Promise<NextResponse | null> {
  if (!isSimulado()) return null;
  const retry = await limitPerIp(getDb(), { action, ip: clientIp(request.headers) });
  if (retry === null) return null;
  return NextResponse.json({ erro: `Aguarde ${retry} s para reenviar (1 envio por minuto).`, codigo: "LIMITE_REENVIO" }, { status: 429, headers: { "Retry-After": String(retry) } });
}

export interface RadContext {
  db: ReturnType<typeof getDb>;
  actor: string;
  companyId: string;
  body: Record<string, unknown>;
}

/** Corpo JSON com `companyId` obrigatório (a proposta tem que ser do cliente aberto na tela); erros do serviço viram HTTP. */
export async function radRoute(request: Request, handler: (ctx: RadContext) => Promise<unknown>): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const companyId = optionalCompanyId(body);
  if (!companyId) return NextResponse.json({ erro: "companyId obrigatório" }, { status: 400 });
  try {
    const result = await handler({ db: getDb(), actor: actorFromRequest(request), companyId, body });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof RadError) return NextResponse.json({ erro: e.message, codigo: e.code }, { status: e.status });
    throw e;
  }
}

export const idOf = async (ctx: { params: Promise<{ id: string }> }) => (await ctx.params).id;

/** Resposta sem bigint (JSON). */
export function proposalJson(p: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
}
