// Intenções da Kim por regra (docs/09 e docs/11): lista fechada, sem LLM. `acao_proibida` é avaliada primeiro.
export const KIM_INTENTS = [
  "acao_proibida",
  "fornecedor_cobrado",
  "semaforo_clientes",
  "semaforo_fornecedores",
  "motivo_cliente",
  "horas",
  "credito_travado",
  "decisoes_hoje",
  "ajuda",
] as const;
export type KimIntent = (typeof KIM_INTENTS)[number];

/** Minúsculas, sem acento, só letras/números/espaço. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RULES: [Exclude<KimIntent, "ajuda" | "motivo_cliente">, RegExp][] = [
  ["acao_proibida", /\b(aprov(a|ar|e|o|em)|recus(a|ar|e|o|em)|pag(a|ar|ue|o|em)|(ger|emit)(a|ar|e|o|ir)\b.*\b(guia|darf|rad)s?)\b/],
  ["fornecedor_cobrado", /\bcobr(ou|ei|ar|aram|ado|ados|ada|adas|anca|ancas)\b/],
  ["semaforo_clientes", /\b(inadimplen\w*|receber|recebimento\w*|vendas?)\b|\bclientes?\b.*\b(semaforo|vermelho|amarelo|verde)\b|\b(semaforo|vermelho|amarelo|verde)\b.*\bclientes?\b/],
  ["semaforo_fornecedores", /\b(semaforo|vermelho|amarelo|fornecedor|fornecedores)\b/],
  ["horas", /\b(horas?|tempo|economiz\w*)\b/],
  ["credito_travado", /\b(credito|creditos|travad\w*|quanto)\b/],
  ["decisoes_hoje", /\b(decid\w*|decisao|decisoes|hoje|pendent\w*|preciso)\b/],
];

const MOTIVO = /\b(por que|porque|motivo)\b/;

/** `mentionsCompany` diz se o texto cita um cliente da carteira (para `motivo_cliente`). */
export function classify(text: string, mentionsCompany = false): KimIntent {
  const t = normalize(text);
  const [first, ...rest] = RULES;
  if (first[1].test(t)) return first[0];
  // Pergunta de motivo vem antes dos demais: "por que a Padaria tem crédito travado?" é motivo, não total.
  if (MOTIVO.test(t)) return "motivo_cliente";
  for (const [intent, re] of rest) {
    if (re.test(t)) return intent;
  }
  if (mentionsCompany) return "motivo_cliente";
  return "ajuda";
}

const STOP = new Set(["de", "da", "do", "das", "dos", "em", "e", "a", "o", "the"]);

/** Cliente citado no texto: por nome completo ou por uma palavra marcante do nome ("padaria", "sorriso"). */
export function findCompany<T extends { name: string }>(text: string, companies: readonly T[]): T | null {
  const t = ` ${normalize(text)} `;
  const clean = (n: string) => normalize(n.replace(/\s*\(FICTÍCIA\)$/, ""));
  const full = companies.find((c) => t.includes(` ${clean(c.name)} `));
  if (full) return full;
  const scored = companies
    .map((c) => ({ c, hits: clean(c.name).split(" ").filter((w) => w.length >= 4 && !STOP.has(w) && t.includes(` ${w} `)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.c ?? null;
}
