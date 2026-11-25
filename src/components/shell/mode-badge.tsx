import { SIMULATED_BADGE, type ReceitaMode } from "@/lib/config";

export function ModeBadge({ mode }: { mode: ReceitaMode }) {
  if (mode === "SIMULADO") {
    return (
      <span
        role="status"
        className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"
      >
        {SIMULATED_BADGE}
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
      Modo REAL — consulta à Receita Federal
    </span>
  );
}
