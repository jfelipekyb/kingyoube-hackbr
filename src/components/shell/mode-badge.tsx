import { FlaskConical, ShieldCheck } from "lucide-react";
import { SIMULATED_BADGE, type ReceitaMode } from "@/lib/config";
import { cn } from "@/lib/utils";

export function ModeBadge({ mode, className }: { mode: ReceitaMode; className?: string }) {
  const simulado = mode === "SIMULADO";
  const Icon = simulado ? FlaskConical : ShieldCheck;
  return (
    <span
      role="status"
      data-tour={simulado ? "selo-simulado" : undefined}
      className={cn("inline-flex items-center gap-1.5 rounded-kyb-selo border border-kyb-linha bg-kyb-canvas-2 px-3 py-1 text-center text-secundario text-kyb-azul", className)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
      {simulado ? SIMULATED_BADGE : "Modo REAL — consulta à Receita Federal"}
    </span>
  );
}
