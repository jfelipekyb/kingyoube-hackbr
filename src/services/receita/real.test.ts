// RealAdapter com fetch simulado: nenhuma chamada real à Receita.
import { describe, expect, it, vi } from "vitest";
import { RealAdapter, realConfigFromEnv, RECEITA_API_BASE } from "./real";
import { ReceitaError } from "./types";

const COMPANY = { id: "c1", cnpj: "00436612000121", cnpjRoot: "00436612" };
const CONFIG = { clientId: "id-teste", clientSecret: "segredo-teste", tokenUrl: "https://token.exemplo/oauth", cnpj: "00436612000121", radCnpjFormat: 14 as 14 | 8 };

type Call = { url: string; init: RequestInit };

function fakeFetch(routes: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === CONFIG.tokenUrl) return Response.json({ access_token: "tok-1", expires_in: 3600 });
    return routes(String(url), init);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const adapter = (f: typeof fetch, config = CONFIG) => new RealAdapter(config, { resolveCompany: async () => COMPANY, fetch: f });
const headers = (c: Call) => new Headers(c.init.headers);

describe("realConfigFromEnv", () => {
  it("só liga com todas as RFB_*", () => {
    expect(realConfigFromEnv({ RFB_CLIENT_ID: "a", RFB_CLIENT_SECRET: "b", RFB_TOKEN_URL: "https://t" })).toBeNull();
    expect(realConfigFromEnv({ RFB_CLIENT_ID: "a", RFB_CLIENT_SECRET: "b", RFB_TOKEN_URL: "https://t", RFB_CNPJ: "1" })).toMatchObject({ radCnpjFormat: 14 });
    expect(realConfigFromEnv({ RFB_CLIENT_ID: "a", RFB_CLIENT_SECRET: "b", RFB_TOKEN_URL: "https://t", RFB_CNPJ: "1", RAD_CNPJ_FORMAT: "8" })?.radCnpjFormat).toBe(8);
  });
});

describe("RealAdapter", () => {
  it("abre a consulta com Bearer, raiz de 8 dígitos e urlRetorno; reaproveita o token", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({ tiqueteSolicitacao: "T-1", tEASegundos: 120 }, { status: 201 }));
    const a = adapter(fetch);
    expect(await a.requestConsulta("c1", "debitos", { urlRetorno: "https://app/x" })).toEqual({ ticket: "T-1", etaSeconds: 120 });
    await a.requestConsulta("c1", "creditos");
    const token = calls.filter((c) => c.url === CONFIG.tokenUrl);
    expect(token).toHaveLength(1);
    expect(String(token[0].init.body)).toBe("grant_type=client_credentials");
    expect(headers(token[0]).get("authorization")).toMatch(/^Basic /);
    const [deb, cred] = calls.filter((c) => c.url !== CONFIG.tokenUrl);
    expect(deb.url).toBe(`${RECEITA_API_BASE}/debitos/00436612`);
    expect(deb.init.method).toBe("POST");
    expect(headers(deb).get("authorization")).toBe("Bearer tok-1");
    expect(headers(deb).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(deb.init.body))).toEqual({ urlRetorno: "https://app/x" });
    expect(cred.url).toBe(`${RECEITA_API_BASE}/creditos/00436612`);
    expect(headers(cred).get("authorization")).toBe("Bearer tok-1");
    expect(JSON.parse(String(cred.init.body))).toEqual({ urlRetorno: "" });
  });

  it("400/401/500 viram ReceitaError com o codigoErro oficial", async () => {
    for (const [status, codigoErro] of [[400, "REQUISICAO_INVALIDA"], [401, "NAO_AUTORIZADO"], [500, "ERRO_INTERNO"]] as const) {
      const { fetch } = fakeFetch(() => Response.json({ codigoErro, mensagemErro: "m" }, { status }));
      await expect(adapter(fetch).requestConsulta("c1", "pagamentos")).rejects.toMatchObject({ code: codigoErro, httpStatus: status });
    }
  });

  it("token recusado não vaza segredo na mensagem", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const err = await adapter(f).requestConsulta("c1", "debitos").catch((e: ReceitaError) => e);
    expect(err).toBeInstanceOf(ReceitaError);
    expect((err as ReceitaError).message).not.toContain("segredo-teste");
  });

  it("situação: GET com Bearer e Accept; EXPIRADA com código", async () => {
    const { fetch, calls } = fakeFetch(() =>
      Response.json({ situacao: "EXPIRADA", codigoErro: "EXPIRADA", mensagemErro: "Tempo limite de processamento excedido (240 minutos)." }),
    );
    expect(await adapter(fetch).getSituacao("T/1")).toMatchObject({ situacao: "EXPIRADA", codigoErro: "EXPIRADA" });
    const call = calls.at(-1)!;
    expect(call.url).toBe(`${RECEITA_API_BASE}/situacao/T%2F1`);
    expect(call.init.method).toBe("GET");
    expect(headers(call).get("accept")).toBe("application/json");
  });

  it("download: endpoint da urlAssinada não consta (P5) → erro explícito, sem chamar nada", async () => {
    const { fetch, calls } = fakeFetch(() => new Response("", { status: 500 }));
    await expect(adapter(fetch).download("T-1")).rejects.toMatchObject({ code: "PENDENCIA_P5" });
    expect(calls).toHaveLength(0);
  });

  it("URL assinada: GET sem Bearer nem cabeçalhos; vencida não é chamada", async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{"apuracao":[]}', { status: 200 }));
    const a = adapter(fetch);
    expect((await a.fetchSignedFile("https://s3.exemplo/arquivo?assinatura=x")).raw).toBe('{"apuracao":[]}');
    expect(calls[0].init.headers).toBeUndefined();
    await expect(a.fetchSignedFile("https://s3.exemplo/a", "2000-01-01T00:00:00Z")).rejects.toMatchObject({ code: "URL_ASSINADA_EXPIRADA" });
    expect(calls).toHaveLength(1);
  });

  it("RAD: corpo em array com valorDarfParcial em decimal; CNPJ de 14 ou 8 no path", async () => {
    const ok = {
      cdRetorno: "DARF_GERADO",
      darf: { chavePIX: "pix", codigoBarras: "1".repeat(44), linkDarfPDF: "https://pdf" },
      informacoesPagamento: { dataMaximaPagamento: "2026-11-30", valorDarfPrincipal: 115.55, valorDarfTotal: 115.55 },
    };
    const { fetch, calls } = fakeFetch(() => new Response(JSON.stringify(ok).replace(/115\.55/g, "115.55"), { status: 200 }));
    const res = await adapter(fetch).gerarDarfRad("c1", [{ chaveDFE: "K", opcaoPagamento: "PAGAMENTO_PARCIAL", valorDarfParcialCents: 50000n }]);
    expect(res).toMatchObject({ cdRetorno: "DARF_GERADO", informacoesPagamento: { valorDarfPrincipalCents: 11555n, valorDarfTotalCents: 11555n } });
    const call = calls.at(-1)!;
    expect(call.url).toBe(`${RECEITA_API_BASE}/rad/00436612000121`);
    expect(String(call.init.body)).toBe('[{"chaveDFE":"K","opcaoPagamento":"PAGAMENTO_PARCIAL","valorDarfParcial":500.00}]');

    const eight = fakeFetch(() => Response.json({ cdRetorno: "VALOR_PARCIAL_SUPERIOR_DFE", mensagem: "m" }, { status: 422 }));
    const err = await adapter(eight.fetch, { ...CONFIG, radCnpjFormat: 8 }).gerarDarfRad("c1", [{ chaveDFE: "K", opcaoPagamento: "PAGAMENTO_TOTAL" }]);
    expect(err).toMatchObject({ cdRetorno: "VALOR_PARCIAL_SUPERIOR_DFE" });
    expect(eight.calls.at(-1)!.url).toBe(`${RECEITA_API_BASE}/rad/00436612`);
    expect(String(eight.calls.at(-1)!.init.body)).toBe('[{"chaveDFE":"K","opcaoPagamento":"PAGAMENTO_TOTAL"}]');
  });
});
