import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentState = "parado" | "trabalhando" | "feito";

const STATE_LABEL: Record<AgentState, string> = { parado: "parado", trabalhando: "trabalhando", feito: "feito" };

/** Check desenhado em traço SVG (300ms). */
export function CheckDraw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4", className)} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} className="kyb-check-traco" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Ícone do agente com o estado: anel verde pulsando ao trabalhar, check desenhado ao terminar. */
export function AgentStatus({ name, icon: Icon, state, className }: { name: string; icon: LucideIcon; state: AgentState; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", className)} data-agent-state={state}>
      <span
        className={cn(
          "relative inline-flex size-8 items-center justify-center rounded-kyb-selo",
          state === "parado" && "bg-kyb-canvas-2 text-kyb-mudo",
          state === "trabalhando" && "kyb-trabalhando bg-kyb-verde/15 text-kyb-verde-texto",
          state === "feito" && "bg-kyb-verde text-kyb-azul",
        )}
      >
        {state === "feito" ? <CheckDraw /> : <Icon aria-hidden className="size-4" strokeWidth={1.75} />}
      </span>
      <span>
        {name}
        <span className="sr-only"> — {STATE_LABEL[state]}</span>
      </span>
    </span>
  );
}
