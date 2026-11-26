import { describe, expect, it } from "vitest";
import { parseReceitaFile } from "./parser";
import { SimuladoAdapter } from "./simulado";
import { ReceitaError } from "./types";

const PADARIA = { id: "padaria", cnpj: "00436612000121", cnpjRoot: "00436612" };

function adapter(clock: { t: number }, extra: Partial<ConstructorParameters<typeof SimuladoAdapter>[0]> = {}) {
  return new SimuladoAdapter({ resolveCompany: async () => PADARIA, demoToday: "2026-11-20", now: () => new Date(clock.t), ...extra });
}

describe("SimuladoAdapter", () => {
  it("POST devolve tíquete aleatório e tEASegundos 5", async () => {
    const a = adapter({ t: Date.UTC(2026, 10, 25, 12) });
    const one = await a.requestConsulta("padaria", "debitos");
    const two = await a.requestConsulta("padaria", "debitos");
    expect(one.etaSeconds).toBe(5);
    expect(one.ticket).not.toBe(two.ticket);
  });

  it("situação passa por PENDENTE → EM_PROCESSAMENTO → CONCLUIDA com o tempo", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 12) };
    const a = adapter(clock);
    const { ticket } = await a.requestConsulta("padaria", "creditos");
    const seen = [];
    for (const ms of [0, 1_000, 2_500, 4_900, 5_000]) {
      clock.t = Date.UTC(2026, 10, 25, 12) + ms;
      seen.push((await a.getSituacao(ticket)).situacao);
    }
    expect(seen).toEqual(["PENDENTE", "PENDENTE", "EM_PROCESSAMENTO", "EM_PROCESSAMENTO", "CONCLUIDA"]);
  });

  it("SIMULADO_RAPIDO conclui em até 2 s, passando pelos três estados", async () => {
    const start = Date.UTC(2026, 10, 25, 12);
    const clock = { t: start };
    const a = adapter(clock, { rapido: true });
    const { ticket } = await a.requestConsulta("padaria", "debitos");
    const at = async (ms: number) => ((clock.t = start + ms), (await a.getSituacao(ticket)).situacao);
    expect(await at(100)).toBe("PENDENTE");
    expect(await at(900)).toBe("EM_PROCESSAMENTO");
    expect(await at(2_000)).toBe("CONCLUIDA");
  });

  it("download só depois de CONCLUIDA; arquivo da fixture com o tíquete da solicitação", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 12) };
    const a = adapter(clock);
    const { ticket } = await a.requestConsulta("padaria", "recolhimentos");
    await expect(a.download(ticket)).rejects.toMatchObject({ code: "NAO_CONCLUIDA" });
    clock.t += 6_000;
    const file = parseReceitaFile("recolhimentos", (await a.download(ticket)).raw);
    expect(file.ticket).toBe(ticket);
    expect(file.ni).toBe("00436612");
    expect(file.payments[0]).toMatchObject({ principalCents: 10000n, multaCents: 1000n, jurosCents: 500n, totalCents: 11500n });
  });

  it("recolhimentos seguintes trazem o RAD de proposta em darf_gerado", async () => {
    const clock = { t: Date.UTC(2026, 10, 25, 12) };
    const a = adapter(clock, {
      radCollections: async (root) =>
        root === "00436612"
          ? [{ proposalId: "p1", accessKey: "C2KEY", period: "11/2026", dueDate: "2026-11-30", supplierCnpj: "00111111000191", principalCents: 43650n }]
          : [],
    });
    const { ticket } = await a.requestConsulta("padaria", "recolhimentos");
    clock.t += 6_000;
    const file = parseReceitaFile("recolhimentos", (await a.download(ticket)).raw);
    expect(file.payments).toHaveLength(2);
    expect(file.payments[1]).toMatchObject({ accessKey: "C2KEY", principalCents: 43650n, totalCents: 43650n, collectedOn: "2026-11-20" });
    expect(file.payments[1].darfNumber).toMatch(/^\d{17}$/);
  });

  it("tíquete desconhecido → REQUISICAO_INVALIDA", async () => {
    await expect(adapter({ t: 0 }).getSituacao("xyz")).rejects.toBeInstanceOf(ReceitaError);
  });

  it("gerarDarfRad: DARF_GERADO, VALOR_PARCIAL_SUPERIOR_DFE e DFE_NAO_ENCONTRADO", async () => {
    const a = adapter({ t: 0 }, { findDocument: async (_c, key) => (key === "C3" ? { cbsCents: 80000n } : null) });
    const ok = await a.gerarDarfRad("padaria", [{ chaveDFE: "C3", opcaoPagamento: "PAGAMENTO_TOTAL" }]);
    expect(ok.cdRetorno).toBe("DARF_GERADO");
    if (ok.cdRetorno === "DARF_GERADO") {
      expect(ok.informacoesPagamento).toEqual({ dataMaximaPagamento: "2026-11-30", valorDarfPrincipalCents: 80000n, valorDarfTotalCents: 80000n });
      expect(ok.darf.codigoBarras).toMatch(/^\d{44}$/);
      expect(ok.darf.linkDarfPDF).toMatch(/^\/demo\/darf\//);
    }
    const partial = await a.gerarDarfRad("padaria", [{ chaveDFE: "C3", opcaoPagamento: "PAGAMENTO_PARCIAL", valorDarfParcialCents: 80001n }]);
    expect(partial.cdRetorno).toBe("VALOR_PARCIAL_SUPERIOR_DFE");
    expect((await a.gerarDarfRad("padaria", [{ chaveDFE: "X", opcaoPagamento: "PAGAMENTO_TOTAL" }])).cdRetorno).toBe("DFE_NAO_ENCONTRADO");
  });
});
