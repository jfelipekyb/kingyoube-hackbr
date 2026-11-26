import type { ItemStatus } from "@/services/conciliacao/rules";
import { StatusBadge, type StatusTone } from "./status-badge";

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  conciliado: "Conciliado",
  atencao: "Atenção",
  divergente_valor: "Divergência de valor",
  aguardando_janela: "Aguardando a janela",
  so_na_nota: "Só na nota",
  so_na_receita: "Só na Receita",
};

const TONE: Record<ItemStatus, StatusTone> = {
  conciliado: "conciliado",
  atencao: "atencao",
  divergente_valor: "divergente",
  aguardando_janela: "aguardando",
  so_na_nota: "divergente",
  so_na_receita: "divergente",
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  return (
    <StatusBadge tone={TONE[status]} data-status={status}>
      {ITEM_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
