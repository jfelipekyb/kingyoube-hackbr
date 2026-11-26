import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { SupplierError } from "@/services/fornecedor";
import { ScrapeNotAllowedError } from "@/services/vigia/scrape";
import { readJson } from "../receita/http";

export { requireOperator } from "../receita/http";
export { limitEmailResend } from "../rad/http";

export async function supplierRoute(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  handler: (c: { db: ReturnType<typeof getDb>; actor: string; id: string; body: Record<string, unknown> }) => Promise<unknown>,
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  try {
    const result = await handler({ db: getDb(), actor: actorFromRequest(request), id: (await ctx.params).id, body });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof SupplierError) return NextResponse.json({ erro: e.message, codigo: e.code }, { status: e.status });
    if (e instanceof ScrapeNotAllowedError) return NextResponse.json({ erro: e.message, codigo: "FORA_DA_LISTA" }, { status: 400 });
    throw e;
  }
}
