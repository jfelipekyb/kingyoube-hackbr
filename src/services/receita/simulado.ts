// Adaptador SIMULADO (docs/06): assíncrono de verdade — tíquete, situação mudando com o tempo, download do arquivo.
// O tíquete carrega serviço, raiz do CNPJ e hora da abertura: nada fica em memória (funciona entre instâncias).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { addDays } from "@/lib/dates";
import { centsToDecimal } from "@/lib/money";
import { parseReceitaJson, RawNumber, stringifyReceitaJson } from "./json";
import {
  isReceitaService,
  ReceitaError,
  type ArquivoBaixado,
  type ConsultaAberta,
  type RadItem,
  type RadResultado,
  type ReceitaAdapter,
  type ReceitaService,
  type ResolveCompany,
  type SituacaoResposta,
} from "./types";

/** Recolhimento RAD de proposta em `darf_gerado`, que a sincronização seguinte traz (docs/06). */
export interface SimulatedRadCollection {
  proposalId: string;
  accessKey: string;
  period: string;
  dueDate: string;
  supplierCnpj: string;
  principalCents: bigint;
}

export interface SimuladoDeps {
  resolveCompany: ResolveCompany;
  demoToday: string;
  rapido?: boolean;
  now?: () => Date;
  fixturesDir?: string;
  /** Por raiz do CNPJ do cliente (o tíquete só carrega a raiz). */
  radCollections?: (cnpjRoot: string) => Promise<SimulatedRadCollection[]>;
  findDocument?: (companyId: string, accessKey: string) => Promise<{ cbsCents: bigint } | null>;
}

/** Fases do assíncrono simulado em ms: PENDENTE até `pendente`, EM_PROCESSAMENTO até `concluida`. */
export const SIMULADO_TIMING = {
  normal: { pendente: 2_000, concluida: 5_000, eta: 5 },
  rapido: { pendente: 500, concluida: 1_500, eta: 2 },
} as const;

const TICKET_RE = /^SIMULADO-(debitos|creditos|pagamentos|recolhimentos)-(\d{8})-([0-9a-z]+)-([0-9a-f]{16})$/;

export const DEFAULT_FIXTURES_DIR = path.join(process.cwd(), "fixtures", "receita");

const fixtureIndexCache = new Map<string, Map<string, string>>();

/** raiz do CNPJ → pasta do cliente em fixtures/receita/ (lida do campo `ni` dos próprios arquivos). */
function fixtureIndex(dir: string): Map<string, string> {
  const cached = fixtureIndexCache.get(dir);
  if (cached) return cached;
  const index = new Map<string, string>();
  for (const slug of readdirSync(dir)) {
    const header = JSON.parse(readFileSync(path.join(dir, slug, "debitos.json"), "utf8")) as { ni?: string };
    if (header.ni) index.set(header.ni, slug);
  }
  fixtureIndexCache.set(dir, index);
  return index;
}

function darfNumberFor(proposalId: string): string {
  const hex = createHash("sha256").update(`darf:${proposalId}`).digest("hex");
  return BigInt(`0x${hex.slice(0, 16)}`).toString().padStart(17, "0").slice(-17);
}

const money = (cents: bigint) => new RawNumber(centsToDecimal(cents));

export class SimuladoAdapter implements ReceitaAdapter {
  readonly mode = "SIMULADO" as const;
  private readonly now: () => Date;
  private readonly dir: string;

  constructor(private readonly deps: SimuladoDeps) {
    this.now = deps.now ?? (() => new Date());
    this.dir = deps.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  }

  private get timing() {
    return this.deps.rapido ? SIMULADO_TIMING.rapido : SIMULADO_TIMING.normal;
  }

  async requestConsulta(companyId: string, service: ReceitaService): Promise<ConsultaAberta> {
    if (!isReceitaService(service)) throw new ReceitaError("REQUISICAO_INVALIDA", "serviço desconhecido", 400);
    const company = await this.deps.resolveCompany(companyId);
    const ticket = `SIMULADO-${service}-${company.cnpjRoot}-${this.now().getTime().toString(36)}-${randomBytes(8).toString("hex")}`;
    return { ticket, etaSeconds: this.timing.eta };
  }

  private decode(ticket: string) {
    const m = TICKET_RE.exec(ticket);
    if (!m) throw new ReceitaError("REQUISICAO_INVALIDA", "tíquete desconhecido", 400);
    return { service: m[1] as ReceitaService, cnpjRoot: m[2], openedAt: parseInt(m[3], 36) };
  }

  async getSituacao(ticket: string): Promise<SituacaoResposta> {
    const { openedAt } = this.decode(ticket);
    const elapsed = this.now().getTime() - openedAt;
    if (elapsed > 240 * 60_000) {
      return { situacao: "EXPIRADA", codigoErro: "EXPIRADA", mensagemErro: "Tempo limite de processamento excedido (240 minutos)." };
    }
    if (elapsed < this.timing.pendente) return { situacao: "PENDENTE" };
    if (elapsed < this.timing.concluida) return { situacao: "EM_PROCESSAMENTO" };
    return { situacao: "CONCLUIDA" };
  }

  async download(ticket: string): Promise<ArquivoBaixado> {
    const { service, cnpjRoot } = this.decode(ticket);
    if ((await this.getSituacao(ticket)).situacao !== "CONCLUIDA") {
      throw new ReceitaError("NAO_CONCLUIDA", "solicitação ainda não concluída", 409);
    }
    const slug = fixtureIndex(this.dir).get(cnpjRoot);
    if (!slug) throw new ReceitaError("NAO_AUTORIZADO", "consumidor não autorizado para este NI", 401);
    const fixture = readFileSync(path.join(this.dir, slug, `${service}.json`), "utf8");
    const raw = fixture.replace(/("tiqueteSolicitacao":\s*)"[^"]*"/, (_m, prefix: string) => `${prefix}${JSON.stringify(ticket)}`);
    if (service !== "recolhimentos" || !this.deps.radCollections) return { raw };

    const extras = await this.deps.radCollections(cnpjRoot);
    if (extras.length === 0) return { raw };
    const file = parseReceitaJson(raw) as { apuracao: unknown[] };
    file.apuracao.push({
      dataArrecadacao: this.deps.demoToday,
      pagamentos: extras.map((r) => ({
        numeroDARF: darfNumberFor(r.proposalId),
        tipo: new RawNumber("1"),
        composicao: [
          {
            sequencial: new RawNumber("1"),
            pa: r.period,
            vencimento: r.dueDate,
            niFornecedor: r.supplierCnpj,
            chaveDFE: r.accessKey,
            principal: money(r.principalCents),
            multa: money(0n),
            juros: money(0n),
            total: money(r.principalCents),
          },
        ],
      })),
    });
    return { raw: stringifyReceitaJson(file, 2) + "\n" };
  }

  async gerarDarfRad(companyId: string, items: RadItem[]): Promise<RadResultado> {
    if (!Array.isArray(items) || items.length === 0) {
      return { cdRetorno: "DADOS_DE_ENTRADA_INVALIDOS", mensagem: "Informe ao menos um documento.", dadosInvalidos: ["chaveDFE"] };
    }
    let principal = 0n;
    for (const item of items) {
      const doc = (await this.deps.findDocument?.(companyId, item.chaveDFE)) ?? null;
      if (!doc) return { cdRetorno: "DFE_NAO_ENCONTRADO", mensagem: "Documento fiscal não encontrado." };
      if (item.opcaoPagamento === "PAGAMENTO_PARCIAL") {
        const partial = item.valorDarfParcialCents;
        if (partial === undefined || partial <= 0n) {
          return { cdRetorno: "DADOS_DE_ENTRADA_INVALIDOS", mensagem: "Valor parcial obrigatório.", dadosInvalidos: ["valorDarfParcial"] };
        }
        if (partial > doc.cbsCents) {
          return { cdRetorno: "VALOR_PARCIAL_SUPERIOR_DFE", mensagem: "Valor parcial superior ao do documento fiscal." };
        }
        principal += partial;
      } else if (item.opcaoPagamento === "PAGAMENTO_TOTAL") {
        principal += doc.cbsCents;
      } else {
        return { cdRetorno: "DADOS_DE_ENTRADA_INVALIDOS", mensagem: "Opção de pagamento inválida.", dadosInvalidos: ["opcaoPagamento"] };
      }
    }
    const darfId = randomUUID();
    return {
      cdRetorno: "DARF_GERADO",
      darf: {
        chavePIX: randomUUID(),
        codigoBarras: Array.from(randomBytes(44), (b) => (b % 10).toString()).join(""),
        linkDarfPDF: `/demo/darf/${darfId}`,
      },
      informacoesPagamento: {
        dataMaximaPagamento: addDays(this.deps.demoToday, 10),
        valorDarfPrincipalCents: principal,
        valorDarfTotalCents: principal,
      },
    };
  }
}
