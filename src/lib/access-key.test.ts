import { describe, expect, it } from "vitest";
import { accessKeyCheckDigit, buildAccessKey, isValidAccessKey, maskAccessKey, parseAccessKey } from "./access-key";

const parts = {
  uf: "35",
  yearMonth: "2611",
  issuerCnpj: "11222333000181",
  model: "55",
  series: "001",
  number: "000001284",
  emissionType: "1",
  code: "12345678",
};

describe("chave de acesso", () => {
  it("monta chave de 44 dígitos com DV módulo 11 válido", () => {
    const key = buildAccessKey(parts);
    expect(key).toHaveLength(44);
    expect(isValidAccessKey(key)).toBe(true);
    expect(parseAccessKey(key)).toEqual(parts);
  });

  it("calcula o DV com pesos 2..9 da direita para a esquerda", () => {
    const base = "3526111222333000181550010000012841123456780".slice(0, 43);
    const dv = accessKeyCheckDigit(base);
    expect(dv).toBeGreaterThanOrEqual(0);
    expect(dv).toBeLessThanOrEqual(9);
    expect(isValidAccessKey(base + dv)).toBe(true);
    expect(isValidAccessKey(base + ((dv + 1) % 10))).toBe(false);
  });

  it("DV é 0 quando o resto é 0 ou 1", () => {
    // Todos zeros: soma 0, resto 0 → DV 0.
    expect(accessKeyCheckDigit("0".repeat(43))).toBe(0);
  });

  it("recusa chave inválida", () => {
    const key = buildAccessKey(parts);
    expect(isValidAccessKey(key.slice(0, 43))).toBe(false);
    expect(isValidAccessKey(key + "0")).toBe(false);
    expect(isValidAccessKey(key.slice(0, 43) + "x")).toBe(false);
    const wrongDv = key.slice(0, 43) + ((Number(key[43]) + 1) % 10);
    expect(isValidAccessKey(wrongDv)).toBe(false);
    const swapped = key.slice(0, 10) + key[11] + key[10] + key.slice(12);
    if (swapped !== key) expect(isValidAccessKey(swapped)).toBe(false);
    expect(() => parseAccessKey(wrongDv)).toThrow();
  });

  it("recusa campos com tamanho errado", () => {
    expect(() => buildAccessKey({ ...parts, number: "1284" })).toThrow(RangeError);
  });

  it("mascara o meio", () => {
    expect(maskAccessKey(buildAccessKey(parts))).toMatch(/^3526….{4}$/);
  });
});
