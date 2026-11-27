// Pedaços de resposta com duas formas: `fala` (por extenso, para a voz) e `legenda` (números formatados).
import { formatBRL } from "@/lib/money";
import { porExtenso, reaisPorExtenso, type Genero } from "./extenso";

export interface Say {
  fala: string;
  legenda: string;
}

type Part = Say | string;
const asSay = (p: Part): Say => (typeof p === "string" ? { fala: p, legenda: p } : p);

export function say(strings: TemplateStringsArray, ...vals: Part[]): Say {
  let fala = strings[0];
  let legenda = strings[0];
  vals.forEach((v, i) => {
    const s = asSay(v);
    fala += s.fala + strings[i + 1];
    legenda += s.legenda + strings[i + 1];
  });
  return { fala, legenda };
}

export const num = (n: number | bigint, genero: Genero = "m"): Say => ({ fala: porExtenso(n, genero), legenda: new Intl.NumberFormat("pt-BR").format(n) });
export const brl = (cents: bigint): Say => ({ fala: reaisPorExtenso(cents), legenda: formatBRL(cents) });

/** "uma guia" / "2 guias": o 1 sai por extenso nas duas formas, o resto como número. */
export function count(n: number, genero: Genero, singular: string, plural: string): Say {
  if (n === 1) return say`${genero === "f" ? "uma" : "um"} ${singular}`;
  return say`${num(n, genero)} ${plural}`;
}

export function join(parts: Part[], sep = " "): Say {
  const ss = parts.map(asSay);
  return { fala: ss.map((s) => s.fala).join(sep), legenda: ss.map((s) => s.legenda).join(sep) };
}

/** "a, b e c". */
export function list(parts: Part[]): Say {
  const ss = parts.map(asSay);
  if (ss.length <= 1) return ss[0] ?? { fala: "", legenda: "" };
  return join([join(ss.slice(0, -1), ", "), ss[ss.length - 1]], " e ");
}

export const capitalize = (s: Part): Say => {
  const v = asSay(s);
  const up = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return { fala: up(v.fala), legenda: up(v.legenda) };
};
