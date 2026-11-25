// Adaptador REAL (docs/03): só liga com todas as RFB_* configuradas. Testado com fetch simulado; nunca chamado em CI.
import { parseIsoDateTime } from "@/lib/dates";
import { centsToDecimal, parseCents } from "@/lib/money";
import type { Env } from "@/lib/config";
import { parseReceitaJson, RawNumber, stringifyReceitaJson } from "./json";
import { parseConsultaAberta } from "./parser";
import {
  RAD_ERROR_CODES,
  ReceitaError,
  SITUACOES,
  type ArquivoBaixado,
  type ConsultaAberta,
  type RadItem,
  type RadResultado,
  type ReceitaAdapter,
  type ReceitaService,
  type ResolveCompany,
  type SituacaoResposta,
} from "./types";

export const RECEITA_API_BASE = "https://api.receitafederal.gov.br/apuracao-cbs/v2";

export interface RealConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  cnpj: string;
  radCnpjFormat: 14 | 8;
}

/** Null quando falta alguma RFB_* obrigatória: o modo REAL não liga. */
export function realConfigFromEnv(env: Env = process.env): RealConfig | null {
  const clientId = env.RFB_CLIENT_ID?.trim();
  const clientSecret = env.RFB_CLIENT_SECRET?.trim();
  const tokenUrl = env.RFB_TOKEN_URL?.trim();
  const cnpj = env.RFB_CNPJ?.trim();
  if (!clientId || !clientSecret || !tokenUrl || !cnpj) return null;
  return { clientId, clientSecret, tokenUrl, cnpj, radCnpjFormat: env.RAD_CNPJ_FORMAT?.trim() === "8" ? 8 : 14 };
}

export interface RealDeps {
  resolveCompany: ResolveCompany;
  fetch?: typeof fetch;
  now?: () => Date;
}

type Obj = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v : undefined);
const money = (v: unknown, field: string) => {
  if (!(v instanceof RawNumber)) throw new ReceitaError("RESPOSTA_INVALIDA", `campo ${field} ausente na resposta`);
  return parseCents(v.source);
};

export class RealAdapter implements ReceitaAdapter {
  readonly mode = "REAL" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly config: RealConfig,
    private readonly deps: RealDeps,
  ) {
    this.fetch = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
  }

  /** OAuth2 client credentials (RFC 6749 §4.4). URL do token: RFB_TOKEN_URL (pendência P1). */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now().getTime()) return this.token.value;
    if (!this.config.tokenUrl.startsWith("https://")) {
      throw new ReceitaError("TOKEN_URL_INSEGURA", "RFB_TOKEN_URL precisa ser https; a credencial não sai sem TLS");
    }
    const basic = Buffer.from(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`).toString("base64");
    const res = await this.fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new ReceitaError("TOKEN_RECUSADO", `token OAuth2 recusado (HTTP ${res.status})`, res.status);
    const body = (await res.json()) as Obj;
    const value = text(body.access_token);
    if (!value) throw new ReceitaError("TOKEN_RECUSADO", "resposta do token sem access_token", res.status);
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 300;
    this.token = { value, expiresAt: this.now().getTime() + Math.max(expiresIn - 60, 0) * 1000 };
    return value;
  }

  private async call(method: "GET" | "POST", url: string, body?: string) {
    const token = await this.accessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.fetch(url, { method, headers, body });
    return { status: res.status, raw: await res.text() };
  }

  private fail(status: number, raw: string): never {
    let code = `HTTP_${status}`;
    let message = `Receita respondeu HTTP ${status}`;
    try {
      const body = parseReceitaJson(raw) as Obj;
      code = text(body.codigoErro) ?? code;
      message = text(body.mensagemErro) ?? message;
    } catch {
      // corpo não-JSON: fica o código HTTP
    }
    throw new ReceitaError(code, message, status);
  }

  async requestConsulta(companyId: string, service: ReceitaService, options: { urlRetorno?: string } = {}): Promise<ConsultaAberta> {
    const company = await this.deps.resolveCompany(companyId);
    const { status, raw } = await this.call(
      "POST",
      `${RECEITA_API_BASE}/${service}/${company.cnpjRoot}`,
      JSON.stringify({ urlRetorno: options.urlRetorno ?? "" }),
    );
    if (status !== 201) this.fail(status, raw);
    return parseConsultaAberta(raw);
  }

  async getSituacao(ticket: string): Promise<SituacaoResposta> {
    const { status, raw } = await this.call("GET", `${RECEITA_API_BASE}/situacao/${encodeURIComponent(ticket)}`);
    if (status !== 200) this.fail(status, raw);
    const body = parseReceitaJson(raw) as Obj;
    const situacao = text(body.situacao);
    if (!situacao || !(SITUACOES as readonly string[]).includes(situacao)) {
      throw new ReceitaError("RESPOSTA_INVALIDA", "situação desconhecida na resposta");
    }
    return {
      situacao: situacao as SituacaoResposta["situacao"],
      ...(text(body.codigoErro) ? { codigoErro: text(body.codigoErro) } : {}),
      ...(text(body.mensagemErro) ? { mensagemErro: text(body.mensagemErro) } : {}),
    };
  }

  /** O endpoint que devolve a `urlAssinada` não consta em docs/03 (pendência P5): não inventamos caminho. */
  async download(ticket: string): Promise<ArquivoBaixado> {
    void ticket;
    throw new ReceitaError("PENDENCIA_P5", "endpoint de download da urlAssinada não consta na documentação lida (pendência P5)");
  }

  /** GET direto na `urlAssinada`: sem Bearer e sem cabeçalhos extras; respeita `urlAssinadaExpiraEm`. Nunca loga a URL. */
  async fetchSignedFile(urlAssinada: string, urlAssinadaExpiraEm?: string): Promise<ArquivoBaixado> {
    if (!urlAssinada.startsWith("https://")) throw new ReceitaError("URL_ASSINADA_INVALIDA", "URL assinada precisa ser https");
    if (urlAssinadaExpiraEm && parseIsoDateTime(urlAssinadaExpiraEm).getTime() <= this.now().getTime()) {
      throw new ReceitaError("URL_ASSINADA_EXPIRADA", "URL assinada vencida");
    }
    const res = await this.fetch(urlAssinada, { method: "GET" });
    if (res.status !== 200) throw new ReceitaError(`HTTP_${res.status}`, `download do arquivo falhou (HTTP ${res.status})`, res.status);
    return { raw: await res.text() };
  }

  async gerarDarfRad(companyId: string, items: RadItem[]): Promise<RadResultado> {
    const company = await this.deps.resolveCompany(companyId);
    const cnpj = this.config.radCnpjFormat === 8 ? company.cnpjRoot : company.cnpj;
    const body = stringifyReceitaJson(
      items.map((i) =>
        i.opcaoPagamento === "PAGAMENTO_PARCIAL"
          ? {
              chaveDFE: i.chaveDFE,
              opcaoPagamento: i.opcaoPagamento,
              valorDarfParcial: new RawNumber(centsToDecimal(i.valorDarfParcialCents ?? 0n)),
            }
          : { chaveDFE: i.chaveDFE, opcaoPagamento: i.opcaoPagamento },
      ),
    );
    const { status, raw } = await this.call("POST", `${RECEITA_API_BASE}/rad/${cnpj}`, body);
    let parsed: Obj;
    try {
      parsed = parseReceitaJson(raw) as Obj;
    } catch {
      this.fail(status, raw);
    }
    const cd = text(parsed.cdRetorno);
    if (cd === "DARF_GERADO" && status === 200) {
      const darf = (parsed.darf ?? {}) as Obj;
      const info = (parsed.informacoesPagamento ?? {}) as Obj;
      return {
        cdRetorno: "DARF_GERADO",
        darf: { chavePIX: text(darf.chavePIX) ?? "", codigoBarras: text(darf.codigoBarras) ?? "", linkDarfPDF: text(darf.linkDarfPDF) ?? "" },
        informacoesPagamento: {
          dataMaximaPagamento: text(info.dataMaximaPagamento) ?? "",
          valorDarfPrincipalCents: money(info.valorDarfPrincipal, "valorDarfPrincipal"),
          valorDarfTotalCents: money(info.valorDarfTotal, "valorDarfTotal"),
        },
      };
    }
    if (cd && (RAD_ERROR_CODES as readonly string[]).includes(cd)) {
      const dados = Array.isArray(parsed.dadosInvalidos) ? parsed.dadosInvalidos.filter((d): d is string => typeof d === "string") : undefined;
      return { cdRetorno: cd as (typeof RAD_ERROR_CODES)[number], mensagem: text(parsed.mensagem), ...(dados ? { dadosInvalidos: dados } : {}) };
    }
    this.fail(status, raw);
  }
}
