"use client";

import { animate } from "motion";
import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";
import { interpolateInt, prefersReducedMotion } from "@/components/ui/motion-utils";

/**
 * Contagem do valor antigo ao novo (600ms) ou de `from` até o final (ex.: Conferente, 800ms).
 * Trabalha com inteiros (contagens ou centavos); o último quadro é sempre o valor exato.
 */
export function CountUp({
  value,
  from,
  duration = 600,
  format,
  currency = false,
  className,
}: {
  value: bigint | number;
  from?: bigint | number;
  duration?: number;
  format?: (v: bigint) => string;
  /** Formata como R$ (use em Server Components, que não podem passar `format`). */
  currency?: boolean;
  className?: string;
}) {
  const target = BigInt(value);
  const [shown, setShown] = useState<bigint>(from === undefined ? target : BigInt(from));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const start = shownRef.current;
    if (start === target || prefersReducedMotion()) {
      setShown(target);
      return;
    }
    const controls = animate(0, 1000, {
      duration: duration / 1000,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (p) => setShown(interpolateInt(start, target, BigInt(Math.round(p)))),
      onComplete: () => setShown(target),
    });
    return () => controls.stop();
  }, [target, duration]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {(format ?? (currency ? formatBRL : (v: bigint) => v.toLocaleString("pt-BR")))(shown)}
    </span>
  );
}
