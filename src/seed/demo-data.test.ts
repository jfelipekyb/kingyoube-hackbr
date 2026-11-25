import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidAccessKey, parseAccessKey } from "@/lib/access-key";
import { isValidCnpj } from "@/lib/cnpj";
import { businessToday } from "@/lib/clock";
import { daysBetween } from "@/lib/dates";
import { buildDemoData, GENERATED_INVOICES } from "./demo-data";

const TODAY = "2026-11-20";

describe("base de demonstração (docs/06)", () => {
  const data = buildDemoData(TODAY);

  it("tem 12 clientes fictícios com CNPJ válido de raiz 00", () => {
    expect(data.companies).toHaveLength(12);
    for (const c of data.companies) {
      expect(c.name).toMatch(/\(FICTÍCIA\)$/);
      expect(isValidCnpj(c.cnpj)).toBe(true);
      expect(c.cnpj.startsWith("00")).toBe(true);
    }
    for (const cp of data.counterparties) {
      expect(isValidCnpj(cp.cnpj)).toBe(true);
      expect(cp.cnpj.startsWith("00")).toBe(true);
    }
  });

  it("soma 412 notas e 413 itens (V5 existe só na Receita)", () => {
    expect(data.invoices).toHaveLength(412);
    const generated = data.invoices.filter((i) => i.scenario === null);
    expect(generated).toHaveLength(GENERATED_INVOICES);
    const keys = new Set([...data.invoices.map((i) => i.accessKey), ...data.debits.map((d) => d.accessKey), ...data.credits.map((c) => c.accessKey)]);
    expect(keys.size).toBe(413);
    const byCompany = (slug: string) => data.invoices.filter((i) => i.companySlug === slug).length;
    expect(byCompany("padaria-boa-massa")).toBe(39 + 11);
    expect(byCompany("auto-pecas-rota-9")).toBe(31 + 1);
  });

  it("todas as chaves têm DV válido, modelo 55 e emitente coerente com a direção", () => {
    const company = new Map(data.companies.map((c) => [c.slug, c]));
    for (const inv of data.invoices) {
      expect(isValidAccessKey(inv.accessKey)).toBe(true);
      const parts = parseAccessKey(inv.accessKey);
      expect(parts.model).toBe("55");
      const issuer = inv.direction === "venda" ? company.get(inv.companySlug)!.cnpj : inv.counterpartyCnpj;
      expect(parts.issuerCnpj).toBe(issuer);
      expect(typeof inv.cbsCents).toBe("bigint");
    }
  });

  it("cenários à mão batem com os valores de docs/06", () => {
    const s = (id: string) => data.invoices.find((i) => i.scenario === id);
    expect(s("V2")!.cbsCents).toBe(12000n);
    expect(data.debits.find((d) => d.scenario === "V2")!.apurado).toBe(13200n);
    expect(s("V5")).toBeUndefined();
    expect(data.debits.find((d) => d.scenario === "V5")!.apurado).toBe(7500n);
    expect(s("C2")!.cbsCents).toBe(43650n);
    expect(parseAccessKey(s("C2")!.accessKey).number).toBe("000001284");
    expect(s("C3")!.cbsCents).toBe(80000n);
    expect(data.radCollections.find((r) => r.scenario === "C5")!.total).toBe(11500n);
    expect(data.debits.some((d) => d.scenario === "V3" || d.scenario === "V4")).toBe(false);
    expect(data.credits.some((c) => c.scenario === "C6")).toBe(false);
  });

  it("as 400 notas geradas só têm registros conciliados (valor igual ao da Receita)", () => {
    for (const inv of data.invoices.filter((i) => i.scenario === null)) {
      const rec = inv.direction === "venda" ? data.debits.find((d) => d.accessKey === inv.accessKey) : data.credits.find((c) => c.accessKey === inv.accessKey);
      expect(rec?.apurado).toBe(inv.cbsCents);
      expect(daysBetween(inv.issuedOn, TODAY)).toBeGreaterThanOrEqual(9);
    }
  });

  it("gerador determinístico: duas execuções produzem as mesmas 400 notas", () => {
    const again = buildDemoData(TODAY);
    expect(again.invoices).toEqual(data.invoices);
    expect(again.debits).toEqual(data.debits);
    expect(again.credits).toEqual(data.credits);
  });
});

describe("DEMO_TODAY fixo", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["2026-11-25T15:00:00Z", "2027-03-01T03:00:00Z", "2025-01-01T12:00:00Z"])(
    "V3 fica a 2 dias e V4 a 20 dias com relógio real em %s",
    (realNow) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(realNow));
      const today = businessToday({ RECEITA_MODE: "SIMULADO", DEMO_TODAY: TODAY });
      expect(today).toBe(TODAY);
      const d = buildDemoData(today);
      const s = (id: string) => d.invoices.find((i) => i.scenario === id)!;
      expect(daysBetween(s("V3").issuedOn, today)).toBe(2);
      expect(daysBetween(s("V4").issuedOn, today)).toBe(20);
      expect(daysBetween(s("C6").issuedOn, today)).toBe(15);
      expect(daysBetween(d.invoices.find((i) => i.scenario === "R9")!.issuedOn, today)).toBe(12);
    },
  );
});
