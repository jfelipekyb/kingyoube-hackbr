import { createHash } from "node:crypto";

// Gerador pseudoaleatório determinístico (mulberry32). Mesma semente, mesma sequência.

export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Próximo número em [0, 1). Uso interno para sortear inteiros; nunca para dinheiro direto. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  digits(length: number): string {
    let out = "";
    for (let i = 0; i < length; i++) out += this.int(0, 9).toString();
    return out;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

/** UUID estável derivado de um nome (mesmo nome → mesmo id em todo reset). */
export function stableUuid(name: string): string {
  const hex = createHash("sha256").update(`kingyoube-cbs:${name}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
