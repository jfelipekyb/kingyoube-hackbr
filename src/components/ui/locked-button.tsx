"use client";

import { Lock } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botão bloqueado por trava: continua focável e clicável, mas não executa a ação.
 * O clique dá uma tremida curta e mostra o motivo (docs/10, seção 4).
 */
export function LockedButton({
  reason,
  children,
  className,
  variant = "outline",
  size,
}: {
  reason: string;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [shaking, setShaking] = useState(false);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const messageId = useId();

  function onClick() {
    setShown(true);
    setShaking(false);
    // Reinicia a animação a cada clique.
    requestAnimationFrame(() => setShaking(true));
  }

  return (
    <span className={cn("inline-flex flex-col items-end gap-1", className)}>
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        aria-disabled
        aria-describedby={shown ? messageId : undefined}
        data-locked
        className={cn(shaking && "kyb-tremer")}
        onClick={onClick}
        onAnimationEnd={() => setShaking(false)}
      >
        <Lock aria-hidden strokeWidth={1.75} />
        {children}
      </Button>
      <span id={messageId} role="status" aria-live="polite" className={cn("text-secundario text-kyb-alerta", !shown && "sr-only")}>
        {shown ? reason : ""}
      </span>
    </span>
  );
}
