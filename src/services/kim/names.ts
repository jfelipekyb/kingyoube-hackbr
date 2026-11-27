// Como a Kim fala os nomes da base: sem o sufixo "(FICTÍCIA)" e com o artigo certo.
export const shortName = (name: string | null | undefined) => (name ?? "").replace(/\s*\(FICTÍCIA\)$/, "").trim();

/** Nomes falados dos fornecedores da demo (docs/06). Outros: "o fornecedor X". */
const SUPPLIERS: Record<string, { article: "o" | "a"; name: string }> = {
  "Moinho Estrela Farinhas": { article: "o", name: "Moinho Estrela" },
  "Equipamentos Forno Forte": { article: "a", name: "Forno Forte" },
};

export interface Spoken {
  /** "o Moinho Estrela" */
  the: string;
  /** "do Moinho Estrela" */
  of: string;
}

export function spokenSupplier(name: string | null | undefined): Spoken {
  const n = shortName(name);
  const known = SUPPLIERS[n];
  if (known) return { the: `${known.article} ${known.name}`, of: `${known.article === "o" ? "do" : "da"} ${known.name}` };
  return { the: `o fornecedor ${n || "sem nome"}`, of: `do fornecedor ${n || "sem nome"}` };
}

export function spokenCustomer(name: string | null | undefined): string {
  const n = shortName(name);
  return n ? `o cliente ${n}` : "um cliente";
}

const MASCULINE_START = /^(mercadinho|restaurante|atelie|ateliê|pet|escritorio|escritório|posto|supermercado|hotel|bar|laboratorio|laboratório)\b/i;

/** "na Padaria Boa Massa", "no Mercadinho Sol Nascente". */
export function inCompany(name: string): string {
  const n = shortName(name);
  return `${MASCULINE_START.test(n) ? "no" : "na"} ${n}`;
}
