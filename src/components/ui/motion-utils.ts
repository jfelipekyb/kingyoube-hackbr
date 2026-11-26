/** `prefers-reduced-motion: reduce` no navegador; no servidor, considera ligado. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const STEPS = 1000n;

/** Valor intermediário em inteiros (sem float): de `from` até `to` na fração `step`/1000. */
export function interpolateInt(from: bigint, to: bigint, step: bigint): bigint {
  if (step <= 0n) return from;
  if (step >= STEPS) return to;
  return from + ((to - from) * step) / STEPS;
}
