// Números por extenso em português do Brasil (docs/09): a fala da Kim nunca lê dígito.
export type Genero = "m" | "f";

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function unidade(n: number, genero: Genero): string {
  if (genero === "f" && n === 1) return "uma";
  if (genero === "f" && n === 2) return "duas";
  return UNIDADES[n];
}

/** 1 a 999. */
function ate999(n: number, genero: Genero): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(genero === "f" && c > 1 ? CENTENAS[c].replace(/os$/, "as") : CENTENAS[c]);
  if (resto >= 10 && resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
  else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d > 0) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(unidade(u, genero));
  }
  return partes.join(" e ");
}

const ESCALAS: { singular: string; plural: string }[] = [
  { singular: "", plural: "" },
  { singular: "mil", plural: "mil" },
  { singular: "milhão", plural: "milhões" },
  { singular: "bilhão", plural: "bilhões" },
  { singular: "trilhão", plural: "trilhões" },
];

/** Inteiro por extenso. `genero` concorda unidades e centenas ("duas", "quatrocentas"); milhão é sempre masculino. */
export function porExtenso(valor: number | bigint, genero: Genero = "m"): string {
  let n = typeof valor === "bigint" ? valor : BigInt(valor);
  if (typeof valor === "number" && !Number.isInteger(valor)) throw new Error("porExtenso só aceita inteiros");
  if (n === 0n) return "zero";
  if (n < 0n) return `menos ${porExtenso(-n, genero)}`;
  const grupos: number[] = [];
  while (n > 0n) {
    grupos.push(Number(n % 1000n));
    n /= 1000n;
  }
  if (grupos.length > ESCALAS.length) throw new Error("número grande demais para falar");
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    const escala = ESCALAS[i];
    // Unidades e milhares concordam com o substantivo; milhões em diante, com "milhão" (masculino).
    const texto = i === 0 ? ate999(g, genero) : i === 1 ? (g === 1 ? "mil" : `${ate999(g, genero)} mil`) : `${ate999(g, "m")} ${g === 1 ? escala.singular : escala.plural}`;
    partes.push({ texto, valor: g });
  }
  return partes.reduce((acc, p, idx) => {
    if (idx === 0) return p.texto;
    // "mil e cem", "mil e vinte", mas "mil duzentos e trinta": o "e" só entra antes do último grupo redondo ou menor que 100.
    const ultimo = idx === partes.length - 1;
    const junta = ultimo && (p.valor < 100 || p.valor % 100 === 0) ? " e " : " ";
    return acc + junta + p.texto;
  }, "");
}

/** Centavos inteiros → "mil duzentos e trinta e seis reais e cinquenta centavos". */
export function reaisPorExtenso(centavos: bigint): string {
  if (centavos < 0n) return `menos ${reaisPorExtenso(-centavos)}`;
  const reais = centavos / 100n;
  const cents = centavos % 100n;
  const partes: string[] = [];
  if (reais > 0n) {
    // "dois milhões de reais", mas "dois milhões e cem reais".
    const de = reais % 1_000_000n === 0n ? " de" : "";
    partes.push(`${porExtenso(reais, "m")}${de} ${reais === 1n ? "real" : "reais"}`);
  }
  if (cents > 0n) partes.push(`${porExtenso(cents, "m")} ${cents === 1n ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}
