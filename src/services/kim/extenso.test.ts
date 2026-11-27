import { describe, expect, it } from "vitest";
import { porExtenso, reaisPorExtenso } from "./extenso";

describe("números por extenso — tabela de docs/09", () => {
  it.each([
    [50n, "cinquenta centavos"],
    [100n, "um real"],
    [1200n, "doze reais"],
    [10000n, "cem reais"],
    [10100n, "cento e um reais"],
    [43650n, "quatrocentos e trinta e seis reais e cinquenta centavos"],
    [123650n, "mil duzentos e trinta e seis reais e cinquenta centavos"],
    [200000000n, "dois milhões de reais"],
  ])("reaisPorExtenso(%sn)", (centavos, esperado) => {
    expect(reaisPorExtenso(centavos)).toBe(esperado);
  });

  it.each([
    [412, "f", "quatrocentas e doze"],
    [2, "f", "duas"],
    [1284, "f", "mil duzentas e oitenta e quatro"],
    [1284, "m", "mil duzentos e oitenta e quatro"],
  ] as const)("porExtenso(%s, '%s')", (n, genero, esperado) => {
    expect(porExtenso(n, genero)).toBe(esperado);
  });
});

describe("casos de borda", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [12, "doze"],
    [100, "cem"],
    [101, "cento e um"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1100, "mil e cem"],
    [2000, "dois mil"],
    [21_000, "vinte e um mil"],
    [1_000_000, "um milhão"],
    [1_000_100, "um milhão e cem"],
    [2_500_000, "dois milhões e quinhentos mil"],
  ])("porExtenso(%s)", (n, esperado) => {
    expect(porExtenso(n)).toBe(esperado);
  });

  it("feminino nos milhares e centavos isolados", () => {
    expect(porExtenso(2200, "f")).toBe("duas mil e duzentas");
    expect(reaisPorExtenso(1n)).toBe("um centavo");
    expect(reaisPorExtenso(101n)).toBe("um real e um centavo");
    expect(reaisPorExtenso(200000100n)).toBe("dois milhões e um reais");
    expect(reaisPorExtenso(0n)).toBe("zero reais");
  });

  it("recusa número com casa decimal (dinheiro vem em centavos)", () => {
    expect(() => porExtenso(1.5)).toThrow();
  });
});
