import { FlaskConical, ShieldCheck } from "lucide-react";
import { SIMULATED_BADGE, type ReceitaMode } from "@/lib/config";

export function ModeBadge({ mode }: { mode: ReceitaMode }) {
  const simulado = mode === "SIMULADO";
  const Icon = simulado ? FlaskConical : ShieldCheck;
  return (
    <span
      role="status"
      data-tour={simulado ? "selo-simulado" : undefined}
      className="inline-flex items-center gap-1.5 rounded-kyb-selo border border-kyb-linha bg-kyb-canvas-2 px-3 py-1 text-secundario text-kyb-azul"
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
      {simulado ? SIMULATED_BADGE : "Modo REAL — consulta à Receita Federal"}
    </span>
  );
}
