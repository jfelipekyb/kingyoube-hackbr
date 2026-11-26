import { isSimulado } from "@/lib/config";
import { recordSupplierResponse, SupplierError, type SupplierResponse } from "@/services/fornecedor";
import { supplierRoute } from "../../http";

export const dynamic = "force-dynamic";

/** Resposta do fornecedor à cobrança. Só existe na demonstração (simulada); em REAL a resposta viria do próprio fornecedor (PENDENCIAS). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return supplierRoute(request, ctx, async ({ db, actor, id, body }) => {
    if (!isSimulado()) throw new SupplierError(403, "SO_SIMULADO", "A resposta simulada só existe no modo SIMULADO.");
    const response = body.resposta;
    if (response !== "vou_recolher" && response !== "nao_aceito") throw new SupplierError(400, "RESPOSTA_INVALIDA", 'resposta deve ser "vou_recolher" ou "nao_aceito"');
    const row = await recordSupplierResponse({ db }, { counterpartyId: id, response: response as SupplierResponse, actor });
    return { radAcordo: row.radAgreement };
  });
}
