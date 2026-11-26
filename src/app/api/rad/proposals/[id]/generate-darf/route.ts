import { NextResponse } from "next/server";
import { generateDarf } from "@/services/rad";
import { apuracaoDeps } from "../../../../receita/http";
import { idOf, proposalJson, radRoute } from "../../../http";

export const dynamic = "force-dynamic";

/** Só o contador, só proposta `aprovada`: chama gerarDarfRad pelo adaptador (SIMULADO por padrão). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await idOf(ctx);
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  return radRoute(request, async ({ actor, companyId }) => {
    const p = await generateDarf({ db: deps.db, adapter: deps.adapter }, { id, companyId, actor });
    return { proposta: proposalJson(p), ...(p.state === "erro_receita" ? { erro: p.rfbMessage, codigo: p.rfbReturnCode } : {}) };
  });
}
