import { approveProposal } from "@/services/rad";
import { idOf, proposalJson, radRoute } from "../../../http";

export const dynamic = "force-dynamic";

/** Aprovação do contador. Fornecedor vermelho: `awareOfRefusal: true` obrigatório (409 sem ele). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await idOf(ctx);
  return radRoute(request, async ({ db, actor, companyId, body }) => ({
    proposta: proposalJson(await approveProposal(db, { id, companyId, actor, awareOfRefusal: body.awareOfRefusal === true })),
  }));
}
