// Regras determinísticas de conciliação R01–R06 (docs/04). Funções puras; tolerância zero, em centavos.
import { daysBetween } from "@/lib/dates";

export type ItemKind = "debito" | "credito";
export type ItemStatus = "conciliado" | "divergente_valor" | "so_na_nota" | "aguardando_janela" | "so_na_receita" | "atencao";
export type RuleId = "R01" | "R02" | "R03" | "R04" | "R05" | "R06";

/** Nota sem registro na Receita: até 8 dias da última sincronização concluída pode só não ter chegado. */
export const WINDOW_DAYS = 8;

export const RULES: Record<RuleId, { status: ItemStatus; title: string; when: string }> = {
  R01: { status: "conciliado", title: "Conciliado", when: "Nota e Receita existem e a CBS da nota é igual ao valor apurado pela Receita." },
  R02: { status: "divergente_valor", title: "Divergência de valor", when: "Nota e Receita existem e os valores diferem (diferença = Receita − nota)." },
  R03: { status: "aguardando_janela", title: "Aguardando a janela", when: "Nota sem registro na Receita, emitida há até 8 dias da última sincronização concluída." },
  R04: { status: "so_na_nota", title: "Só na nota", when: "Nota sem registro na Receita, emitida há mais de 8 dias da última sincronização concluída." },
  R05: { status: "so_na_receita", title: "Só na Receita", when: "Registro na Receita sem nota no sistema." },
  R06: {
    status: "atencao",
    title: "Atenção",
    when: "Conciliado em valor, mas a Receita mostra valor suspenso, inexigível, inapropriável, prescrito ou origem diferente de 0 (cancelamento/devolução).",
  },
};

export interface InvoiceFact {
  id: string;
  accessKey: string;
  period: string;
  kind: ItemKind;
  issuedOn: string; // AAAA-MM-DD (Brasília)
  cbsCents: bigint;
}

/** Uma linha da Receita (débito ou crédito); várias origens da mesma chave e período são somadas. */
export interface ReceitaLine {
  accessKey: string;
  period: string;
  kind: ItemKind;
  origin: number;
  apuradoCents: bigint;
  /** suspenso + inexigível (débito) ou suspenso + inapropriável + prescrito (crédito). */
  blockedCents: bigint;
}

export interface ItemDraft {
  invoiceId: string | null;
  accessKey: string;
  period: string;
  kind: ItemKind;
  status: ItemStatus;
  ruleId: RuleId;
  invoiceCents: bigint | null;
  rfbCents: bigint | null;
  diffCents: bigint | null;
}

export const keyOf = (x: { accessKey: string; period: string; kind: ItemKind }) => `${x.kind}|${x.accessKey}|${x.period}`;

interface ReceitaGroup {
  apuradoCents: bigint;
  blockedCents: bigint;
  otherOrigin: boolean;
}

function groupReceita(lines: ReceitaLine[]): Map<string, ReceitaGroup & { line: ReceitaLine }> {
  const groups = new Map<string, ReceitaGroup & { line: ReceitaLine }>();
  for (const l of lines) {
    const k = keyOf(l);
    const g = groups.get(k) ?? { apuradoCents: 0n, blockedCents: 0n, otherOrigin: false, line: l };
    g.apuradoCents += l.apuradoCents;
    g.blockedCents += l.blockedCents;
    g.otherOrigin ||= l.origin !== 0;
    groups.set(k, g);
  }
  return groups;
}

/**
 * Classifica nota × Receita. `referenceDay[kind]` é o dia da última sincronização concluída do serviço
 * (débitos para vendas, créditos para compras); `null` = nunca sincronizado → o tipo não gera item.
 * Ordem: R05 → R03/R04 → R02 → R06 → R01.
 */
export function classify(input: {
  invoices: InvoiceFact[];
  receita: ReceitaLine[];
  referenceDay: Record<ItemKind, string | null>;
}): ItemDraft[] {
  const groups = groupReceita(input.receita.filter((l) => input.referenceDay[l.kind] !== null));
  const invoiceKeys = new Set<string>();
  const out: ItemDraft[] = [];

  for (const inv of input.invoices) {
    const ref = input.referenceDay[inv.kind];
    if (ref === null) continue;
    const k = keyOf(inv);
    invoiceKeys.add(k);
    const base = { invoiceId: inv.id, accessKey: inv.accessKey, period: inv.period, kind: inv.kind, invoiceCents: inv.cbsCents };
    const g = groups.get(k);
    if (!g) {
      const late = daysBetween(inv.issuedOn, ref) > WINDOW_DAYS;
      out.push({ ...base, status: late ? "so_na_nota" : "aguardando_janela", ruleId: late ? "R04" : "R03", rfbCents: null, diffCents: null });
      continue;
    }
    const diff = g.apuradoCents - inv.cbsCents;
    const rule: RuleId = diff !== 0n ? "R02" : g.blockedCents > 0n || g.otherOrigin ? "R06" : "R01";
    out.push({ ...base, status: RULES[rule].status, ruleId: rule, rfbCents: g.apuradoCents, diffCents: diff });
  }

  for (const [k, g] of groups) {
    if (invoiceKeys.has(k)) continue;
    out.push({
      invoiceId: null,
      accessKey: g.line.accessKey,
      period: g.line.period,
      kind: g.line.kind,
      status: "so_na_receita",
      ruleId: "R05",
      invoiceCents: null,
      rfbCents: g.apuradoCents,
      diffCents: null,
    });
  }
  return out;
}
