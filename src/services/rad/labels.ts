// Textos do RAD que a tela (cliente) também usa: sem acesso a banco.
import type { RadErrorCode } from "@/services/receita/types";

export type RadState = "rascunho" | "aguardando_aprovacao" | "aprovada" | "darf_gerado" | "pago_confirmado" | "recusada" | "erro_receita" | "vencida";

export const RAD_STATE_LABEL: Record<RadState, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovada: "Aprovada",
  darf_gerado: "DARF gerado",
  pago_confirmado: "Pago (confirmado pela Receita)",
  recusada: "Recusada",
  erro_receita: "Erro da Receita",
  vencida: "Vencida",
};

export const RAD_ERROR_MESSAGE: Record<RadErrorCode, string> = {
  DFE_NAO_ENCONTRADO: "A Receita não encontrou o documento fiscal desta chave de acesso. Confira a chave da nota.",
  VALOR_PARCIAL_SUPERIOR_DFE: "O valor parcial é maior que a CBS do documento fiscal. Corrija o valor e envie a proposta de novo.",
  CNPJ_NAO_ADQUIRENTE: "O CNPJ do cliente não é o adquirente desta nota. Só quem comprou pode recolher via RAD.",
  DADOS_DE_ENTRADA_INVALIDOS: "A Receita recusou os dados enviados. Revise a opção de pagamento e o valor.",
};


export const AWARE_OF_REFUSAL_TEXT = "Estou ciente da recusa do fornecedor";

export interface DecisionView {
  /** Só o Analista envia o rascunho ao contador (docs/02). */
  canSubmit: boolean;
  /** O contador pode aprovar/recusar nesta tela. */
  canDecide: boolean;
  /** Por que o contador não pode decidir agora (mostrado na tela). */
  blockedReason: string | null;
}

/** O que a tela oferece a cada papel. A trava de verdade continua no servidor (decide/approve). */
export function decisionView(
  p: { state: RadState; preparedBy: string; submittedBy: string | null },
  viewer: { role: "analista" | "contador"; actor: string },
): DecisionView {
  const editable = p.state === "rascunho" || p.state === "erro_receita";
  if (viewer.role === "analista") return { canSubmit: editable, canDecide: false, blockedReason: null };
  if (editable) {
    return {
      canSubmit: false,
      canDecide: false,
      blockedReason:
        "Aprovar direto não é permitido: pela regra (docs/02), o rascunho passa pelo Analista, que envia; o contador decide depois, e quem envia não decide. Peça ao Analista para enviar a proposta.",
    };
  }
  if (p.state !== "aguardando_aprovacao") return { canSubmit: false, canDecide: false, blockedReason: null };
  if (p.submittedBy === viewer.actor || p.preparedBy === viewer.actor) {
    return { canSubmit: false, canDecide: false, blockedReason: "Você preparou ou enviou esta proposta: quem envia não decide. Outro contador precisa decidir." };
  }
  return { canSubmit: false, canDecide: true, blockedReason: null };
}
