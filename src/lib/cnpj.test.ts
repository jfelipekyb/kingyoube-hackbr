import { describe, expect, it } from "vitest";
import { buildCnpj, cnpjCheckDigits, cnpjRoot, formatCnpj, isValidCnpj } from "./cnpj";

describe("CNPJ", () => {
  it("valida CNPJ correto com e sem máscara", () => {
    // Exemplo didático clássico de CNPJ válido (11.222.333/0001-81).
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e repetidos", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11222333000191")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("11a22333000181")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("calcula dígitos e monta CNPJ válido a partir da raiz", () => {
    expect(cnpjCheckDigits("112223330001")).toBe("81");
    const cnpj = buildCnpj("00123456");
    expect(cnpj).toHaveLength(14);
    expect(cnpj.startsWith("001234560001")).toBe(true);
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  it("extrai a raiz de 8 dígitos", () => {
    expect(cnpjRoot("11.222.333/0001-81")).toBe("11222333");
    expect(() => cnpjRoot("11222333000182")).toThrow();
  });

  it("formata com máscara", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
