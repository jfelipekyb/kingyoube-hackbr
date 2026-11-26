import { NextResponse } from "next/server";
import { sendDarfMessages } from "@/services/notificacao";
import { generateDarf } from "@/services/rad";
import { apuracaoDeps } from "../../../../receita/http";
import { idOf, proposalJson, radRoute, requireOperator } from "../../../http";

export const dynamic = "force-dynamic";

/** Em REAL exige Bearer CRON_SECRET (login de verdade fica fora do hack, P26). Só o contador, só proposta `aprovada`: chama gerarDarfRad pelo adaptador (SIMULADO por padrão); depois o Mensageiro envia. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const id = await idOf(ctx);
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  return radRoute(request, async ({ actor, companyId }) => {
    const p = await generateDarf({ db: deps.db, adapter: deps.adapter }, { id, companyId, actor });
    if (p.state === "darf_gerado") await sendDarfMessages({ db: deps.db }, p.id, actor);
    return { proposta: proposalJson(p), ...(p.state === "erro_receita" ? { erro: p.rfbMessage, codigo: p.rfbReturnCode } : {}) };
  });
}
