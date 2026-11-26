// Agente Analista (docs/04, docs/09): explicação por modelo fixo de texto, com os números já calculados.
// A LLM (opcional) só reescreve; se o texto reescrito mudar qualquer número, fica o original.
import type { Env } from "@/lib/config";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { ItemKind, RuleId } from "@/services/conciliacao/rules";

export interface ExplanationFacts {
  ruleId: RuleId;
  kind: ItemKind;
  period: string; // MM/AAAA (contrato da Receita)
  invoiceCents: bigint | null;
  rfbCents: bigint | null;
  diffCents: bigint | null;
  issuedOn: string | null;
  referenceDay: string;
  daysSinceIssue: number | null;
  /** Valores da Receita que travam o item (R06), já somados por chave e período. */
  blocked: { label: string; cents: bigint }[];
  otherOrigin: boolean;
}

const brl = (v: bigint | null) => formatBRL(v ?? 0n);
const abs = (v: bigint) => (v < 0n ? -v : v);

export function templateExplanation(f: ExplanationFacts): string {
  const what = f.kind === "debito" ? "CBS" : "crédito de CBS";
  const service = f.kind === "debito" ? "débitos" : "créditos";
  const period = f.period;
  switch (f.ruleId) {
    case "R01":
      return `A nota informa ${what} de ${brl(f.invoiceCents)} e a Receita apurou o mesmo valor para a mesma chave no período ${period}. Nada a fazer.`;
    case "R02": {
      const d = f.diffCents ?? 0n;
      const side = d > 0n ? "a maior na Receita" : "a menor na Receita";
      return `A nota informa ${what} de ${brl(f.invoiceCents)}. A Receita apurou ${brl(f.rfbCents)} para a mesma chave no período ${period}. Diferença de ${formatBRL(abs(d))} ${side}. Verifique a classificação tributária dos itens da nota.`;
    }
    case "R03":
      return `A nota de ${formatDateBR(f.issuedOn!)} (${brl(f.invoiceCents)} de ${what}) ainda não aparece nos ${service} da Receita, mas foi emitida há ${f.daysSinceIssue} dias da última sincronização. Pode só não ter chegado: aguarde a próxima sincronização.`;
    case "R04":
      return `A nota de ${formatDateBR(f.issuedOn!)} (${brl(f.invoiceCents)} de ${what}) não aparece nos ${service} da Receita ${f.daysSinceIssue} dias depois da emissão. Confira se a nota foi transmitida e autorizada.`;
    case "R05":
      return `A Receita registra ${brl(f.rfbCents)} de ${what} para uma chave do período ${period} que não existe no sistema. Localize a nota e importe, ou confirme com o cliente se ela é dele.`;
    case "R06": {
      const parts = f.blocked.map((b) => `${formatBRL(b.cents)} ${b.label}`);
      if (f.otherOrigin) parts.push("lançamento de cancelamento ou devolução");
      return `O valor bate (${brl(f.invoiceCents)}), mas a Receita mostra ${parts.join(" e ")} para a mesma chave no período ${period}. Confira antes de considerar o item resolvido.`;
    }
  }
}

/** Números do texto (inclui datas e valores); a reescrita precisa ter exatamente os mesmos. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,/]\d+)*/g) ?? []).sort();
}

export function sameNumbers(original: string, rewritten: string): boolean {
  const a = numbersIn(original);
  const b = numbersIn(rewritten);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export type Rewriter = (text: string) => Promise<string | null>;

/** Reescrita via Anthropic, só quando ANTHROPIC_API_KEY e LLM_MODEL existem. Recebe só o texto (sem CNPJ). */
export function llmRewriter(env: Env = process.env, fetchImpl: typeof fetch = fetch): Rewriter | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!key || !model) return null;
  return async (text) => {
    try {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system:
            "Reescreva a explicação fiscal em português do Brasil, mais clara para um contador. Não altere, não acrescente e não remova nenhum número, valor, data ou período. Responda só com o texto.",
          messages: [{ role: "user", content: text }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const out = body.content?.find((c) => c.type === "text")?.text?.trim();
      return out || null;
    } catch {
      return null;
    }
  };
}

/** Devolve o texto final e o original; a reescrita só vale se preservar todos os números. */
export async function explain(facts: ExplanationFacts, rewriter: Rewriter | null): Promise<{ explanation: string; original: string; rewritten: boolean }> {
  const original = templateExplanation(facts);
  if (!rewriter || facts.ruleId === "R01") return { explanation: original, original, rewritten: false };
  const out = await rewriter(original);
  if (out && sameNumbers(original, out)) return { explanation: out, original, rewritten: true };
  return { explanation: original, original, rewritten: false };
}
