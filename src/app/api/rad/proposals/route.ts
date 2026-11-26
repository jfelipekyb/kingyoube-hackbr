import { prepareProposal } from "@/services/rad";
import { proposalJson, radRoute } from "../http";

export const dynamic = "force-dynamic";

/** A Tesouraria prepara o rascunho de RAD para uma compra candidata. */
export async function POST(request: Request) {
  return radRoute(request, async ({ db, actor, companyId, body }) => {
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
    return { proposta: proposalJson(await prepareProposal(db, { companyId, invoiceId, requestedBy: actor })) };
  });
}
