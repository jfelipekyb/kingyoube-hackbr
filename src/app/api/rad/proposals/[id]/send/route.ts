import { RadError, getProposal } from "@/services/rad";
import { sendDarfMessages } from "@/services/notificacao";
import { idOf, limitEmailResend, radRoute, requireOperator } from "../../../http";

export const dynamic = "force-dynamic";

/** Reenvio do DARF pelo Mensageiro (e-mail e WhatsApp). Idempotente: não duplica. REAL: Bearer CRON_SECRET; SIMULADO: 1/min por IP. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireOperator(request) ?? (await limitEmailResend(request, "rad.reenviar_email"));
  if (denied) return denied;
  const id = await idOf(ctx);
  return radRoute(request, async ({ db, actor, companyId }) => {
    const p = await getProposal(db, id, companyId);
    if (!["darf_gerado", "pago_confirmado", "vencida"].includes(p.state)) throw new RadError(409, "SEM_DARF", "A proposta ainda não tem DARF gerado.");
    const { email, whatsapp } = await sendDarfMessages({ db }, id, actor);
    return { email: { status: email.lastStatus, para: email.toLabel }, whatsapp: { status: whatsapp.lastStatus } };
  });
}
