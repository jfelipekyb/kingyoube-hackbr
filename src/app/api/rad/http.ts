import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { RadError } from "@/services/rad";
import { optionalCompanyId, readJson } from "../receita/http";

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
