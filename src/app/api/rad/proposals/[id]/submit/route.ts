import { submitProposal } from "@/services/rad";
import { idOf, proposalJson, radRoute } from "../../../http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await idOf(ctx);
  return radRoute(request, async ({ db, actor, companyId }) => ({ proposta: proposalJson(await submitProposal(db, { id, companyId, actor })) }));
}
