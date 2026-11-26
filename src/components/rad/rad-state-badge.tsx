import { CircleCheck, CircleX, Clock, FilePen, FileText, Hourglass, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { RAD_STATE_LABEL, type RadState } from "@/services/rad/labels";

const STYLE: Record<RadState, { tone: StatusTone; icon: LucideIcon }> = {
  rascunho: { tone: "aguardando", icon: FilePen },
  aguardando_aprovacao: { tone: "atencao", icon: Hourglass },
  aprovada: { tone: "conciliado", icon: ShieldCheck },
  darf_gerado: { tone: "atencao", icon: FileText },
  pago_confirmado: { tone: "conciliado", icon: CircleCheck },
  recusada: { tone: "divergente", icon: CircleX },
  erro_receita: { tone: "divergente", icon: TriangleAlert },
  vencida: { tone: "divergente", icon: Clock },
};

/** Estado da proposta de RAD: ícone + texto. */
export function RadStateBadge({ state }: { state: RadState }) {
  const s = STYLE[state];
  return (
    <StatusBadge tone={s.tone} icon={s.icon} data-state={state}>
      {RAD_STATE_LABEL[state]}
    </StatusBadge>
  );
}
