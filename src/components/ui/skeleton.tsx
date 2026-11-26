import { cn } from "@/lib/utils";

/** Esqueleto de carregamento com brilho suave (nunca spinner na tela inteira). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("kyb-esqueleto rounded-kyb-botao", className)} {...props} />;
}

export function SkeletonRows({ rows = 4, label = "Carregando…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
