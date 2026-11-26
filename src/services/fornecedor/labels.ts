import type { OutboundMessage } from "@/services/notificacao";

export type ChargeState = "sem_contato" | "contato_encontrado" | "enviada" | "entregue" | "falhou" | "devolvida";
export const CHARGE_STATE_LABEL: Record<ChargeState, string> = {
  sem_contato: "sem contato",
  contato_encontrado: "contato encontrado",
  enviada: "cobrança enviada",
  entregue: "cobrança entregue",
  falhou: "envio falhou",
  devolvida: "e-mail devolvido",
};

/** sem_contato → contato_encontrado → enviada → entregue; desvios falhou e devolvida (docs/02). */
export function chargeState(financeEmail: string | null, lastEmailStatus: string | null | undefined): ChargeState {
  if (!financeEmail) return "sem_contato";
  if (!lastEmailStatus) return "contato_encontrado";
  if (lastEmailStatus === "delivered" || lastEmailStatus === "opened" || lastEmailStatus === "clicked") return "entregue";
  if (lastEmailStatus === "bounced") return "devolvida";
  if (lastEmailStatus === "erro" || lastEmailStatus === "failed") return "falhou";
  return "enviada";
}

export interface SupplierContactInfo {
  siteUrl: string | null;
  contactSource: "cadastro" | "firecrawl" | "simulado";
  contactFoundAt: Date | null;
  chargeInvoiceId: string | null;
  chargeInvoiceNumber: string | null;
  email: OutboundMessage | null;
  whatsapp: OutboundMessage | null;
  state: ChargeState;
}

