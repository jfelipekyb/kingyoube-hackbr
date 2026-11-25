import { NextResponse } from "next/server";
import { actorFromRequest } from "@/lib/request-actor";
import { recordAudit } from "@/services/auditoria";
import { ReceitaError, syncCompany, syncOverview, syncPortfolio } from "@/services/receita";
import { apuracaoDeps, optionalCompanyId, readJson } from "../http";

export const dynamic = "force-dynamic";

/** Abre as consultas de um cliente (`companyId`) ou da carteira inteira; só os serviços com cota. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const companyId = optionalCompanyId(body);
  if (companyId === undefined) return NextResponse.json({ erro: "companyId inválido" }, { status: 400 });
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  await recordAudit(deps.db, {
    actor: actorFromRequest(request),
    action: "receita.sync",
    entity: companyId ? "company" : "carteira",
    entityId: companyId,
    result: "solicitado",
  });
  try {
    const results = companyId ? [await syncCompany(deps, companyId)] : await syncPortfolio(deps);
    return NextResponse.json({ results, overview: await syncOverview(deps.db, { companyId }) });
  } catch (e) {
    if (e instanceof ReceitaError && e.code === "REQUISICAO_INVALIDA") return NextResponse.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}
