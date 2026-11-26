import { RadError, getProposal } from "@/services/rad";
import { sendDarfMessages } from "@/services/notificacao";
import { idOf, radRoute } from "../../../http";

export const dynamic = "force-dynamic";

/** Reenvio do DARF pelo Mensageiro (e-mail e WhatsApp). Idempotente: não duplica. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await idOf(ctx);
  return radRoute(request, async ({ db, actor, companyId }) => {
    const p = await getProposal(db, id, companyId);
    if (!["darf_gerado", "pago_confirmado", "vencida"].includes(p.state)) throw new RadError(409, "SEM_DARF", "A proposta ainda não tem DARF gerado.");
    const { email, whatsapp } = await sendDarfMessages({ db }, id, actor);
    return { email: { status: email.lastStatus, para: email.toLabel }, whatsapp: { status: whatsapp.lastStatus } };
  });
}
