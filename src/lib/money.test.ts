import { describe, expect, it } from "vitest";
import { centsToDecimal, formatBRL, parseCents } from "./money";

describe("parseCents", () => {
  it("converte texto com 2 casas para centavos bigint", () => {
    expect(parseCents("115.55")).toBe(11555n);
    expect(parseCents("436.50")).toBe(43650n);
    expect(parseCents("884.51")).toBe(88451n);
    expect(parseCents("0.01")).toBe(1n);
    expect(parseCents("0.00")).toBe(0n);
  });

  it("aceita inteiro e 1 casa, como a Receita serializa number(18,2)", () => {
    expect(parseCents("70")).toBe(7000n);
    expect(parseCents("3002")).toBe(300200n);
    expect(parseCents("115.5")).toBe(11550n);
  });

  it("aceita negativo e valores acima do limite seguro do float", () => {
    expect(parseCents("-12.00")).toBe(-1200n);
    expect(parseCents("9999999999999999.99")).toBe(999999999999999999n);
  });

  it("não sofre erro de float (0.1 + 0.2)", () => {
    expect(parseCents("0.10") + parseCents("0.20")).toBe(parseCents("0.30"));
  });

  it("recusa mais de 2 casas em vez de arredondar", () => {
    expect(() => parseCents("1.005")).toThrow(RangeError);
    expect(() => parseCents("115.555")).toThrow(RangeError);
  });

  it("recusa formatos ambíguos", () => {
    for (const bad of ["", " 1.00", "1,00", "1e2", "R$ 1,00", ".50", "1.", "abc", "+1.00", "NaN"]) {
      expect(() => parseCents(bad), bad).toThrow(RangeError);
    }
  });

  it("recusa number (só texto)", () => {
    expect(() => parseCents(115.55 as unknown as string)).toThrow(TypeError);
  });
});

describe("centsToDecimal", () => {
  it("formata no padrão number(18,2)", () => {
    expect(centsToDecimal(11555n)).toBe("115.55");
    expect(centsToDecimal(7000n)).toBe("70.00");
    expect(centsToDecimal(5n)).toBe("0.05");
    expect(centsToDecimal(-1200n)).toBe("-12.00");
  });

  it("faz ida e volta com parseCents", () => {
    for (const cents of [0n, 1n, 99n, 100n, 43650n, 123650n, 4850000n]) {
      expect(parseCents(centsToDecimal(cents))).toBe(cents);
    }
  });
});

describe("formatBRL", () => {
  it("usa ponto de milhar e vírgula decimal", () => {
    expect(formatBRL(123650n)).toBe("R$ 1.236,50");
    expect(formatBRL(43650n)).toBe("R$ 436,50");
    expect(formatBRL(0n)).toBe("R$ 0,00");
    expect(formatBRL(5n)).toBe("R$ 0,05");
    expect(formatBRL(4850000n)).toBe("R$ 48.500,00");
    expect(formatBRL(200000000n)).toBe("R$ 2.000.000,00");
    expect(formatBRL(-1200n)).toBe("-R$ 12,00");
  });
});
