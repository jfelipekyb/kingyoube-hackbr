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
