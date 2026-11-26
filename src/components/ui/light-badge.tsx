import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Light } from "@/services/semaforos";
import { StatusBadge, type StatusTone } from "./status-badge";

const TONE: Record<Light, StatusTone> = { verde: "conciliado", amarelo: "atencao", vermelho: "divergente" };
const ICON = { verde: CircleCheck, amarelo: CircleAlert, vermelho: CircleX };
const LABEL: Record<Light, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };
const DOT: Record<Light, string> = { verde: "text-kyb-verde-texto", amarelo: "text-kyb-alerta", vermelho: "text-kyb-erro" };

/** Selo do semáforo: sempre ícone + texto (docs/11). */
export function LightBadge({ light, children }: { light: Light; children?: React.ReactNode }) {
  return (
    <StatusBadge tone={TONE[light]} icon={ICON[light]} data-light={light}>
      {children ?? LABEL[light]}
    </StatusBadge>
  );
}

/** Bolinhas da Carteira: quantos vermelhos e amarelos, com ícone + texto. */
export function LightDots({ counts, label }: { counts: Record<Light, number>; label: string }) {
  const items = (["vermelho", "amarelo"] as const).filter((l) => counts[l] > 0);
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
