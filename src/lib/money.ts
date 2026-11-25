// Dinheiro sempre em centavos inteiros (bigint). Nada de float.

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Converte um valor decimal em texto ("115.55", "70", "884.5") para centavos.
 * Recusa mais de 2 casas decimais, notação científica, vírgula e espaços:
 * nunca arredonda em silêncio.
 */
export function parseCents(value: string): bigint {
  if (typeof value !== "string") {
    throw new TypeError("parseCents aceita só texto; converta o valor da Receita a partir da string");
  }
  const match = DECIMAL_RE.exec(value);
  if (!match) {
    throw new RangeError(`Valor monetário inválido: "${value}" (esperado número com até 2 casas decimais)`);
  }
  const [, sign, integerPart, fraction = ""] = match;
  const cents = BigInt(integerPart) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return sign ? -cents : cents;
}

/** Centavos → texto decimal com 2 casas ("115.55"), formato `number(18,2)` da Receita. */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const integerPart = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${integerPart}.${fraction}`;
}

/** Centavos → "R$ 1.236,50". Negativo: "-R$ 12,00". */
export function formatBRL(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const integerPart = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${integerPart},${fraction}`;
}
