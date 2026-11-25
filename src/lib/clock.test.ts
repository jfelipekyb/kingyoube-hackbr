import { describe, expect, it } from "vitest";
import { businessToday, DEFAULT_DEMO_TODAY, demoToday } from "./clock";

describe("relógio da demo", () => {
  it("usa o padrão 2026-11-20 quando DEMO_TODAY não está definido", () => {
    expect(demoToday({})).toBe(DEFAULT_DEMO_TODAY);
  });

  it("respeita DEMO_TODAY e recusa formato inválido", () => {
    expect(demoToday({ DEMO_TODAY: "2026-12-01" })).toBe("2026-12-01");
    expect(() => demoToday({ DEMO_TODAY: "01/12/2026" })).toThrow();
  });

  it("em SIMULADO ignora o relógio real; em REAL usa o dia de Brasília", () => {
    const now = new Date("2030-03-03T12:00:00Z");
    expect(businessToday({ RECEITA_MODE: "SIMULADO" }, now)).toBe("2026-11-20");
    expect(businessToday({ RECEITA_MODE: "REAL" }, now)).toBe("2030-03-03");
  });
});
