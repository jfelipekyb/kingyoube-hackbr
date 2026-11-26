// Contrato interno do conector da Receita (docs/03). Só os adaptadores conhecem URLs.
import type { ReceitaMode } from "@/lib/config";
import { RECEITA_SERVICES, type ReceitaService } from "@/seed/receita-fixtures";

export { RECEITA_SERVICES, type ReceitaService };

export const SERVICE_LABEL: Record<ReceitaService, string> = {
  debitos: "débitos",
  creditos: "créditos",
  pagamentos: "pagamentos",
  recolhimentos: "recolhimentos",
};

export function isReceitaService(value: unknown): value is ReceitaService {
  return typeof value === "string" && (RECEITA_SERVICES as readonly string[]).includes(value);
}

export const SITUACOES = ["PENDENTE", "EM_PROCESSAMENTO", "CONCLUIDA", "ERRO", "EXPIRADA"] as const;
export type Situacao = (typeof SITUACOES)[number];

export interface ConsultaAberta {
  ticket: string;
  /** `tEASegundos`; -1 quando a Receita não consegue estimar. */
  etaSeconds: number;
}

export interface SituacaoResposta {
  situacao: Situacao;
  codigoErro?: string;
  mensagemErro?: string;
}

export interface ArquivoBaixado {
  /** Texto bruto do arquivo, como veio. O sha256 é calculado sobre ele. */
  raw: string;
}

export type RadOpcao = "PAGAMENTO_TOTAL" | "PAGAMENTO_PARCIAL";

export interface RadItem {
  chaveDFE: string;
  opcaoPagamento: RadOpcao;
  /** Obrigatório só no parcial; ignorado no total. */
  valorDarfParcialCents?: bigint;
}

export const RAD_ERROR_CODES = [
  "DFE_NAO_ENCONTRADO",
  "VALOR_PARCIAL_SUPERIOR_DFE",
  "CNPJ_NAO_ADQUIRENTE",
  "DADOS_DE_ENTRADA_INVALIDOS",
] as const;
export type RadErrorCode = (typeof RAD_ERROR_CODES)[number];

export type RadResultado =
  | {
      cdRetorno: "DARF_GERADO";
      darf: { chavePIX: string; codigoBarras: string; linkDarfPDF: string };
      informacoesPagamento: { dataMaximaPagamento: string; valorDarfPrincipalCents: bigint; valorDarfTotalCents: bigint };
    }
  | { cdRetorno: RadErrorCode; mensagem?: string; dadosInvalidos?: string[] };

export interface ReceitaCompany {
  id: string;
  cnpj: string;
  cnpjRoot: string;
}

export type ResolveCompany = (companyId: string) => Promise<ReceitaCompany>;

export interface ReceitaAdapter {
  readonly mode: ReceitaMode;
  requestConsulta(companyId: string, service: ReceitaService, options?: { urlRetorno?: string }): Promise<ConsultaAberta>;
  getSituacao(ticket: string): Promise<SituacaoResposta>;
  download(ticket: string): Promise<ArquivoBaixado>;
  gerarDarfRad(companyId: string, items: RadItem[]): Promise<RadResultado>;
}

/** Erro devolvido pela Receita (ou pelo adaptador) com código estável. A mensagem nunca leva token nem URL assinada. */
export class ReceitaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ReceitaError";
  }
}

/** Configuração que impede o modo REAL de subir (faltam variáveis). */
export class ReceitaConfigError extends Error {}
