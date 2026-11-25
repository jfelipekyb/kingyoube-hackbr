import { describe, expect, it } from "vitest";
import { parseReceitaJson, RawNumber, stringifyReceitaJson } from "./json";
import { parseConsultaAberta, parseReceitaFile, ReceitaFileError } from "./parser";

// Exemplos oficiais de docs/03 (§2 débitos, §3 créditos), com datas em "Z" e em "-03:00".
const DEBITOS_OFICIAL = `{
  "tiqueteSolicitacao": "abc-123", "ni": "12345678", "niConsumidor": "12345678000190",
  "geradoEm": "2026-09-29T13:00:00Z",
  "apuracao": [ { "pa": "06/2026", "debitos": [ {
    "origem": 0, "documento": 55, "chave": "35260612345678000190550010000000011000000010",
    "emissao": "2026-06-10T10:00:00-03:00", "registro": "2026-06-11T08:00:00Z", "atualizacao": "2026-06-12T08:00:00.123Z",
    "cbs": { "excedente": 10, "apurado": 70, "inexigivel": 5, "suspenso": 15, "extinto": 10, "saldoDevedor": 40 }
  } ] } ] }`;

const CREDITOS_OFICIAL = `{
  "tiqueteSolicitacao": "def-456", "ni": "12345678", "niConsumidor": "12345678000190",
  "geradoEm": "2026-09-29T10:00:00-03:00",
  "apuracao": [ { "pa": "06/2026", "creditos": [ {
    "origem": 0, "documento": 55, "chave": "35260612345678000190550010000000021000000020",
    "emissao": "2026-06-10T10:00:00Z", "registro": "2026-06-11T08:00:00-03:00", "atualizacao": "2026-06-11T08:00:00-03:00",
    "cbs": { "apurado": 3002, "apropriacao": { "apropriado": 3002, "utilizacao": { "utilizado": 884.51,
      "naoUtilizado": { "saldoCredor": 0, "pedidoRessarcimento": 2117.49 } } } }
  } ] } ] }`;

describe("JSON da Receita sem float", () => {
  it("guarda o texto-fonte de cada número", () => {
    const v = parseReceitaJson('{"a": 0.00, "b": 884.51, "c": 0.1}') as Record<string, RawNumber>;
    expect(v.a.source).toBe("0.00");
    expect(v.b.source).toBe("884.51");
    expect(v.c.source).toBe("0.1");
  });

  it("serializa RawNumber como número JSON", () => {
    expect(stringifyReceitaJson([{ valorDarfParcial: new RawNumber("500.00") }])).toBe('[{"valorDarfParcial":500.00}]');
  });
});

describe("parser dos arquivos (docs/03)", () => {
  it("débitos: exemplo oficial, datas com Z e -03:00, ausentes = 0", () => {
    const file = parseReceitaFile("debitos", DEBITOS_OFICIAL);
    expect(file.geradoEm.toISOString()).toBe("2026-09-29T13:00:00.000Z");
    expect(file.debits).toHaveLength(1);
    const [d] = file.debits;
    expect(d).toMatchObject({
      period: "06/2026",
      origin: 0,
      docModel: 55,
      excedenteCents: 1000n,
      apuradoCents: 7000n,
      inexigivelCents: 500n,
      suspensoCents: 1500n,
      extintoCents: 1000n,
      saldoDevedorCents: 4000n,
      pgtoAntecipadoCents: 0n,
    });
    expect(d.issuedAt.toISOString()).toBe("2026-06-10T13:00:00.000Z");
    expect(d.registeredAt.toISOString()).toBe("2026-06-11T08:00:00.000Z");
  });

  it("créditos: exemplo oficial e campos zero ausentes viram 0", () => {
    const [c] = parseReceitaFile("creditos", CREDITOS_OFICIAL).credits;
    expect(c).toMatchObject({
      apuradoCents: 300200n,
      apropriadoCents: 300200n,
      utilizadoCents: 88451n,
      saldoCredorCents: 0n,
      pedidoRessarcimentoCents: 211749n,
      aApropriarCents: 0n,
      inapropriavelCents: 0n,
      suspensoCents: 0n,
      excedenteCents: 0n,
    });
    expect(c.issuedAt.toISOString()).toBe("2026-06-10T10:00:00.000Z");
    expect(c.registeredAt.toISOString()).toBe("2026-06-11T11:00:00.000Z");
  });

  it("apuracao vazia não gera linhas", () => {
    const raw = '{"tiqueteSolicitacao":"t","ni":"12345678","niConsumidor":"12345678000190","geradoEm":"2026-09-29T13:00:00Z","apuracao":[]}';
    for (const s of ["debitos", "creditos", "pagamentos", "recolhimentos"] as const) {
      const f = parseReceitaFile(s, raw);
      expect(f.debits.length + f.credits.length + f.payments.length).toBe(0);
    }
  });

  it("pagamentos: RAD (tipo 1, niAdquirente) e PCONT (tipo 2)", () => {
    const raw = `{"tiqueteSolicitacao":"t","ni":"12345678","niConsumidor":"12345678000190","geradoEm":"2026-09-29T13:00:00Z",
      "apuracao":[{"dataArrecadacao":"2026-09-15","pagamentos":[
        {"numeroDARF":"01234567890123456","tipo":1,"niAdquirente":"98765432000110",
         "composicao":[{"sequencial":1,"pa":"08/2026","vencimento":"2026-09-20","niContribuinte":"12345678000190","chaveDFE":"K1","principal":115.55,"multa":0,"juros":0,"total":115.55}]},
        {"numeroDARF":"01234567890123457","tipo":2,"niContribuinte":"12345678000190",
         "composicao":[{"sequencial":1,"pa":"08/2026","vencimento":"2026-09-20","principal":90,"multa":1.5,"juros":0.3,"total":91.8}]}]}]}`;
    const [rad, pcont] = parseReceitaFile("pagamentos", raw).payments;
    expect(rad).toMatchObject({ type: 1, counterpartyCnpj: "98765432000110", accessKey: "K1", principalCents: 11555n, totalCents: 11555n });
    expect(pcont).toMatchObject({ type: 2, counterpartyCnpj: null, accessKey: null, multaCents: 150n, jurosCents: 30n, totalCents: 9180n });
  });

  it("recolhimentos: niFornecedor e chaveDFE", () => {
    const raw = `{"tiqueteSolicitacao":"t","ni":"12345678","niConsumidor":"12345678000190","geradoEm":"2026-09-29T13:00:00Z",
      "apuracao":[{"dataArrecadacao":"2026-11-13","pagamentos":[{"numeroDARF":"03341630055229670","tipo":1,
        "composicao":[{"sequencial":1,"pa":"10/2026","vencimento":"2026-11-13","niFornecedor":"00201918000107","chaveDFE":"K","principal":100.00,"multa":10.00,"juros":5.00,"total":115.00}]}]}]}`;
    const [p] = parseReceitaFile("recolhimentos", raw).payments;
    expect(p).toMatchObject({ counterpartyCnpj: "00201918000107", collectedOn: "2026-11-13", principalCents: 10000n, totalCents: 11500n });
  });

  it("recusa valor com mais de 2 casas (nunca arredonda em silêncio) e obrigatório ausente", () => {
    expect(() => parseReceitaFile("debitos", DEBITOS_OFICIAL.replace('"apurado": 70', '"apurado": 70.005'))).toThrow(ReceitaFileError);
    expect(() => parseReceitaFile("debitos", DEBITOS_OFICIAL.replace(', "saldoDevedor": 40', ""))).toThrow(/saldoDevedor/);
  });

  it("recusa data sem fuso", () => {
    expect(() => parseReceitaFile("debitos", DEBITOS_OFICIAL.replace("2026-06-11T08:00:00Z", "2026-06-11T08:00:00"))).toThrow(/registro/);
  });

  it("resposta 201 da abertura", () => {
    expect(parseConsultaAberta('{"tiqueteSolicitacao": "abc", "tEASegundos": 120}')).toEqual({ ticket: "abc", etaSeconds: 120 });
    expect(parseConsultaAberta('{"tiqueteSolicitacao": "abc", "tEASegundos": -1}').etaSeconds).toBe(-1);
  });
});
