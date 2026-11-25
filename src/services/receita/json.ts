// JSON da Receita sem float: todo número guarda o texto-fonte (number 18,2 → parseCents sem arredondar).

/** Número JSON como veio no texto ("115.55", "0.00", "55"). */
export class RawNumber {
  constructor(readonly source: string) {}
}

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown;

/** `JSON.parse` com o texto-fonte de cada número (Node 22: reviver com `context.source`). */
export function parseReceitaJson(text: string): unknown {
  const reviver: Reviver = (_key, value, context) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") {
      throw new Error("Este runtime não expõe o texto-fonte dos números do JSON; recuso converter dinheiro por float");
    }
    return new RawNumber(context.source);
  };
  return JSON.parse(text, reviver as (this: unknown, key: string, value: unknown) => unknown);
}

const MARK = "\u0000num:";

/** Serializa mantendo `RawNumber` como número JSON (ex.: `valorDarfParcial: 500.00`). */
export function stringifyReceitaJson(value: unknown, space?: number): string {
  const text = JSON.stringify(
    value,
    (_k, v: unknown) => {
      if (v instanceof RawNumber) return `${MARK}${v.source}`;
      if (typeof v === "bigint") throw new TypeError("Use RawNumber(centsToDecimal(...)) para dinheiro");
      return v;
    },
    space,
  );
  return text.replace(/"\\u0000num:(-?[0-9.eE+-]+)"/g, (_m, n: string) => n);
}
