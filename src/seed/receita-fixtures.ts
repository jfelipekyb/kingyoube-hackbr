// Arquivos da Receita simulada, no formato exato de docs/03 (o que o adaptador SIMULADO devolve no download).
import { centsToDecimal } from "@/lib/money";
import { addDays, brasiliaDateTime } from "@/lib/dates";
import type { DemoData } from "./demo-data";

export const RECEITA_SERVICES = ["debitos", "creditos", "pagamentos", "recolhimentos"] as const;
export type ReceitaService = (typeof RECEITA_SERVICES)[number];

// Valores number(18,2) saem como número JSON com 2 casas, sem passar por float.
const MONEY_MARK = "__cents__";
const money = (cents: bigint) => `${MONEY_MARK}${cents}`;
function stringifyWithMoney(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(new RegExp(`"${MONEY_MARK}(-?\\d+)"`, "g"), (_, c: string) =>
      centsToDecimal(BigInt(c)),
    ) + "\n"
  );
}

/** Campos que a Receita omite quando zero: só entram se > 0. */
function optional(entries: [string, bigint | undefined][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of entries) if (v !== undefined && v !== 0n) out[k] = money(v);
  return out;
}

function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return [...map.entries()].sort(([a], [b]) => sortablePeriod(a).localeCompare(sortablePeriod(b)));
}

const sortablePeriod = (p: string) => (/^\d{2}\/\d{4}$/.test(p) ? p.slice(3) + p.slice(0, 2) : p);
const byIssue = <T extends { issuedOn: string; accessKey: string }>(a: T, b: T) =>
  a.issuedOn.localeCompare(b.issuedOn) || a.accessKey.localeCompare(b.accessKey);

/** Monta os 4 arquivos de cada cliente. Chave do mapa: "<slug>/<servico>.json". */
export function buildReceitaFixtures(data: DemoData): Map<string, string> {
  const files = new Map<string, string>();
  const geradoEm = `${data.demoToday}T13:00:00Z`;

  for (const company of data.companies) {
    const header = (service: ReceitaService) => ({
      tiqueteSolicitacao: `SIMULADO-${service}-${company.cnpjRoot}`,
      ni: company.cnpjRoot,
      niConsumidor: company.cnpj,
      geradoEm,
    });

    const debits = data.debits.filter((d) => d.companySlug === company.slug).sort(byIssue);
    files.set(`${company.slug}/debitos.json`, stringifyWithMoney({
      ...header("debitos"),
      apuracao: groupBy(debits, (d) => d.period).map(([pa, items]) => ({
        pa,
        debitos: items.map((d) => {
          const registro = brasiliaDateTime(addDays(d.issuedOn, 1), "08:00:00");
          return {
            origem: 0,
            documento: 55,
            chave: d.accessKey,
            emissao: brasiliaDateTime(d.issuedOn),
            registro,
            atualizacao: registro,
            cbs: {
              apurado: money(d.apurado),
              ...optional([["suspenso", d.suspenso], ["extinto", d.extinto]]),
              saldoDevedor: money(d.saldoDevedor),
            },
          };
        }),
      })),
    }));

    const credits = data.credits.filter((c) => c.companySlug === company.slug).sort(byIssue);
    files.set(`${company.slug}/creditos.json`, stringifyWithMoney({
      ...header("creditos"),
      apuracao: groupBy(credits, (c) => c.period).map(([pa, items]) => ({
        pa,
        creditos: items.map((c) => {
          const registro = brasiliaDateTime(addDays(c.issuedOn, 1), "08:00:00");
          return {
            origem: 0,
            documento: 55,
            chave: c.accessKey,
            emissao: brasiliaDateTime(c.issuedOn),
            registro,
            atualizacao: registro,
            cbs: {
              apurado: money(c.apurado),
              apropriacao: {
                ...optional([["inapropriavel", c.inapropriavel], ["aApropriar", c.aApropriar], ["apropriado", c.apropriado]]),
                utilizacao: {
                  ...optional([["utilizado", c.utilizado]]),
                  naoUtilizado: { saldoCredor: money(c.saldoCredor) },
                },
              },
            },
          };
        }),
      })),
    }));

    const pcont = data.pcontPayments.filter((p) => p.companySlug === company.slug);
    files.set(`${company.slug}/pagamentos.json`, stringifyWithMoney({
      ...header("pagamentos"),
      apuracao: groupBy(pcont, (p) => p.dataArrecadacao).map(([dataArrecadacao, items]) => ({
        dataArrecadacao,
        pagamentos: items.map((p) => ({
          numeroDARF: p.numeroDARF,
          tipo: 2,
          niContribuinte: p.niContribuinte,
          composicao: [
            {
              sequencial: 1,
              pa: p.period,
              vencimento: p.vencimento,
              principal: money(p.principal),
              multa: money(p.multa),
              juros: money(p.juros),
              total: money(p.total),
            },
          ],
        })),
      })),
    }));

    const rad = data.radCollections.filter((r) => r.companySlug === company.slug);
    files.set(`${company.slug}/recolhimentos.json`, stringifyWithMoney({
      ...header("recolhimentos"),
      apuracao: groupBy(rad, (r) => r.dataArrecadacao).map(([dataArrecadacao, items]) => ({
        dataArrecadacao,
        pagamentos: items.map((r) => ({
          numeroDARF: r.numeroDARF,
          tipo: 1,
          composicao: [
            {
              sequencial: 1,
              pa: r.period,
              vencimento: r.vencimento,
              niFornecedor: r.niFornecedor,
              chaveDFE: r.chaveDFE,
              principal: money(r.principal),
              multa: money(r.multa),
              juros: money(r.juros),
              total: money(r.total),
            },
          ],
        })),
      })),
    }));
  }
  return files;
}
