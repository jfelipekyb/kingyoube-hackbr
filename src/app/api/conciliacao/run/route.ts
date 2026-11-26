import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { recordAudit } from "@/services/auditoria";
import { reconcile, reconcilePortfolio } from "@/services/conciliacao";
import { optionalCompanyId, readJson, requireOperator } from "../../receita/http";

export const dynamic = "force-dynamic";

/** Concilia um cliente (`companyId`) ou a carteira inteira; regra determinística, LLM só redige. */
export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const companyId = optionalCompanyId(body);
  if (companyId === undefined) return NextResponse.json({ erro: "companyId inválido" }, { status: 400 });
  const db = getDb();
  const result = companyId ? await reconcile({ db }, companyId) : (await reconcilePortfolio({ db })).total;
  await recordAudit(db, {
    actor: actorFromRequest(request),
    action: "conciliacao.run",
    entity: companyId ? "company" : "carteira",
    entityId: companyId,
    result: `${result.total} itens`,
  });
  return NextResponse.json({ total: result.total, byStatus: result.byStatus, explained: result.explained });
}
