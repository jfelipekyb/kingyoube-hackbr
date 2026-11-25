// Agentes da Equipe CBS (docs/09).
export const AGENTS = [
  { key: "kim", name: "Kim · gestora", role: "Resume a carteira e responde por voz" },
  { key: "captura", name: "Captura", role: "Recebe as notas da carteira" },
  { key: "apuracao", name: "Apuração", role: "Busca na Receita débitos, créditos, pagamentos e recolhimentos" },
  { key: "conciliador", name: "Conciliador", role: "Casa nota × Receita e classifica" },
  { key: "conferente", name: "Conferente", role: "Refaz a conciliação de forma independente e aponta diferenças" },
  { key: "analista", name: "Analista", role: "Explica cada item que pede atenção" },
  { key: "tesouraria", name: "Tesouraria", role: "Prepara a proposta de guia RAD (rascunho)" },
  { key: "vigia", name: "Vigia", role: "Lê a documentação da Receita e o site do fornecedor" },
  { key: "mensageiro", name: "Mensageiro", role: "Envia cobrança, DARF e alertas" },
] as const;

export type AgentKey = (typeof AGENTS)[number]["key"];

export const AGENT_KEYS = AGENTS.map((a) => a.key) as AgentKey[];

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as string[]).includes(value);
}
