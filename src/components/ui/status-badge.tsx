import { CircleAlert, CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "conciliado" | "atencao" | "divergente" | "aguardando";

const TONES: Record<StatusTone, { icon: LucideIcon; label: string; className: string }> = {
  conciliado: { icon: CircleCheck, label: "Conciliado", className: "border-kyb-verde/50 bg-kyb-verde/10 text-kyb-verde-texto" },
  atencao: { icon: CircleAlert, label: "Atenção", className: "border-kyb-alerta/40 bg-kyb-alerta/10 text-kyb-alerta" },
  divergente: { icon: CircleX, label: "Divergente", className: "border-kyb-erro/40 bg-kyb-erro/10 text-kyb-erro" },
  aguardando: { icon: Clock, label: "Aguardando", className: "border-kyb-linha bg-kyb-canvas-2 text-kyb-mudo" },
};

/** Selo de status: sempre ícone + texto, nunca só cor. */
export function StatusBadge({
  tone,
  children,
  icon,
  className,
  ...props
}: { tone: StatusTone; icon?: LucideIcon } & React.ComponentProps<"span">) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-kyb-selo border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        t.className,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
      {children ?? t.label}
    </span>
  );
}
