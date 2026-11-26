import { describe, expect, it } from "vitest";
import { classify, type InvoiceFact, type ReceitaLine } from "./rules";

const KEY = "3".repeat(44);
const ref = { debito: "2026-11-20", credito: "2026-11-20" };
const inv = (over: Partial<InvoiceFact> = {}): InvoiceFact => ({ id: "inv-1", accessKey: KEY, period: "2026-11", kind: "debito", issuedOn: "2026-11-01", cbsCents: 12000n, ...over });
const rfb = (over: Partial<ReceitaLine> = {}): ReceitaLine => ({ accessKey: KEY, period: "2026-11", kind: "debito", origin: 0, apuradoCents: 12000n, blockedCents: 0n, ...over });
const one = (invoices: InvoiceFact[], receita: ReceitaLine[], referenceDay: { debito: string | null; credito: string | null } = ref) => {
  const out = classify({ invoices, receita, referenceDay });
  expect(out).toHaveLength(1);
  return out[0];
};

describe("regras de conciliação (docs/04)", () => {
  it("R01: nota e Receita com o mesmo valor → conciliado", () => {
    expect(one([inv()], [rfb()])).toMatchObject({ ruleId: "R01", status: "conciliado", diffCents: 0n, rfbCents: 12000n, invoiceCents: 12000n });
  });

  it("R02: valores diferentes → divergente_valor, diff = Receita − nota", () => {
    expect(one([inv()], [rfb({ apuradoCents: 13200n })])).toMatchObject({ ruleId: "R02", status: "divergente_valor", diffCents: 1200n });
    expect(one([inv()], [rfb({ apuradoCents: 11999n })])).toMatchObject({ ruleId: "R02", diffCents: -1n });
  });

  it("R03: sem registro na Receita e emitida há até 8 dias da última sincronização → aguardando_janela", () => {
    expect(one([inv({ issuedOn: "2026-11-12" })], [])).toMatchObject({ ruleId: "R03", status: "aguardando_janela", rfbCents: null, diffCents: null });
  });

  it("R04: sem registro na Receita e emitida há mais de 8 dias → so_na_nota", () => {
    expect(one([inv({ issuedOn: "2026-11-11" })], [])).toMatchObject({ ruleId: "R04", status: "so_na_nota", invoiceCents: 12000n });
  });

  it("R05: registro na Receita sem nota → so_na_receita (avaliada primeiro)", () => {
    expect(one([], [rfb({ apuradoCents: 7500n })])).toMatchObject({ ruleId: "R05", status: "so_na_receita", invoiceId: null, rfbCents: 7500n, invoiceCents: null });
    // nota de outro período não casa: a chave + período é o par
    const out = classify({ invoices: [inv({ period: "2026-10", issuedOn: "2026-10-30" })], receita: [rfb()], referenceDay: ref });
    expect(out.map((o) => o.ruleId).sort()).toEqual(["R04", "R05"]);
  });

  it("R06: valor bate mas há suspenso/inexigível/inapropriável/prescrito ou origem ≠ 0 → atencao", () => {
    expect(one([inv()], [rfb({ blockedCents: 2000n })])).toMatchObject({ ruleId: "R06", status: "atencao", diffCents: 0n });
    expect(one([inv({ kind: "credito" })], [rfb({ kind: "credito", blockedCents: 12000n })])).toMatchObject({ ruleId: "R06" });
    // origem ≠ 0 somada por chave e período: 15000 (origem 0) − 3000 (devolução) = 12000
    expect(one([inv()], [rfb({ apuradoCents: 15000n }), rfb({ origin: 2, apuradoCents: -3000n })])).toMatchObject({ ruleId: "R06", rfbCents: 12000n });
    // divergência vence atenção (ordem R02 → R06)
    expect(one([inv()], [rfb({ apuradoCents: 13000n, blockedCents: 100n })])).toMatchObject({ ruleId: "R02" });
  });

  it("tipo nunca sincronizado não gera item", () => {
    expect(classify({ invoices: [inv()], receita: [rfb()], referenceDay: { debito: null, credito: "2026-11-20" } })).toEqual([]);
  });
});
