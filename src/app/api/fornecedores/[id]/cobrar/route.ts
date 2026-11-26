import { notifySupplier, SupplierError } from "@/services/fornecedor";
import { limitEmailResend, requireOperator, supplierRoute } from "../../http";

export const dynamic = "force-dynamic";

/** Mensageiro cobra o fornecedor (e-mail com cobranca-<invoiceId> + WhatsApp simulado). REAL: Bearer CRON_SECRET; SIMULADO: 1/min por IP. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request) ?? (await limitEmailResend(request, "fornecedor.cobrar"));
  if (denied) return denied;
  return supplierRoute(request, ctx, async ({ db, actor, body }) => {
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : null;
    if (!invoiceId) throw new SupplierError(400, "SEM_NOTA", "invoiceId obrigatório");
    const { email, whatsapp } = await notifySupplier({ db }, invoiceId, actor);
    return { email: { status: email.lastStatus, para: email.toLabel }, whatsapp: { status: whatsapp.lastStatus } };
  });
}
