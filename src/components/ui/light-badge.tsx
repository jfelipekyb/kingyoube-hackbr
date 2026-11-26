import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Light, LightCounts, RowLight } from "@/services/semaforos";
import { StatusBadge, type StatusTone } from "./status-badge";

const TONE: Record<RowLight, StatusTone> = { verde: "conciliado", amarelo: "atencao", vermelho: "divergente", aguardando: "aguardando" };
const ICON = { verde: CircleCheck, amarelo: CircleAlert, vermelho: CircleX, aguardando: CircleDashed };
const LABEL: Record<RowLight, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", aguardando: "Aguardando sincronização" };
const DOT: Record<Light, string> = { verde: "text-kyb-verde-texto", amarelo: "text-kyb-alerta", vermelho: "text-kyb-erro" };

/** Selo do semáforo: sempre ícone + texto (docs/11). Sem dado da Receita, selo neutro. */
export function LightBadge({ light, children }: { light: RowLight; children?: React.ReactNode }) {
  return (
    <StatusBadge tone={TONE[light]} icon={ICON[light]} data-light={light}>
      {children ?? LABEL[light]}
    </StatusBadge>
  );
}

/** Bolinhas da Carteira: quantos vermelhos e amarelos, com ícone + texto. */
export function LightDots({ counts, label }: { counts: LightCounts; label: string }) {
  const items = (["vermelho", "amarelo"] as const).filter((l) => counts[l] > 0);
  if (items.length === 0 && counts.verde === 0 && counts.aguardando > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-kyb-mudo" aria-label={`${label}: aguardando sincronização`} data-light="aguardando">
        <CircleDashed aria-hidden className="size-3.5" strokeWidth={1.75} />
        aguardando sincronização
      </span>
    );
  }
  if (items.length === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs", DOT.verde)} aria-label={`${label}: todos verdes`}>
        <CircleCheck aria-hidden className="size-3.5" strokeWidth={1.75} />
        verdes
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label={label}>
      {items.map((l) => {
        const Icon = ICON[l];
        return (
          <span key={l} className={cn("inline-flex items-center gap-1", DOT[l])} data-light={l}>
            <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
            {counts[l]} {counts[l] === 1 ? LABEL[l].toLowerCase() : `${LABEL[l].toLowerCase()}s`}
          </span>
        );
      })}
    </span>
  );
}
