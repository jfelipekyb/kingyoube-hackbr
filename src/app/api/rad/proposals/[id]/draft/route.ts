import { RadError, updateDraft } from "@/services/rad";
import { idOf, proposalJson, radRoute } from "../../../http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await idOf(ctx);
  return radRoute(request, async ({ db, actor, companyId, body }) => {
    const option = body.option === "PAGAMENTO_PARCIAL" ? "PAGAMENTO_PARCIAL" : body.option === "PAGAMENTO_TOTAL" ? "PAGAMENTO_TOTAL" : null;
    if (!option) throw new RadError(400, "OPCAO", "Escolha pagamento total ou parcial.");
    const raw = typeof body.partialCents === "string" ? body.partialCents.trim() : "";
    if (raw && !/^\d+$/.test(raw)) throw new RadError(400, "VALOR_PARCIAL", "Valor parcial inválido.");
    const partialCents = raw ? BigInt(raw) : null;
    const justification = typeof body.justification === "string" ? body.justification : "";
    return { proposta: proposalJson(await updateDraft(db, { id, companyId, actor, option, partialCents, justification })) };
  });
}
