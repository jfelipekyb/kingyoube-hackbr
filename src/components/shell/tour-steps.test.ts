import { describe, expect, it } from "vitest";
import { availableSteps, readTourSeen, TOUR_SEEN_KEY, TOUR_STEPS, writeTourSeen } from "./tour-steps";

describe("tour guiado (docs/10, seção 5)", () => {
  it("tem os 8 passos na ordem do documento", () => {
    expect(TOUR_STEPS.map((s) => s.target)).toEqual(["logo", "rodar-equipe", "conferente", "kim", "carteira", "rad", "equipe", "selo-simulado"]);
  });

  it("mostra só os passos cujo elemento existe", () => {
    const present = new Set(["logo", "kim", "carteira", "rad", "equipe", "selo-simulado"]);
    expect(availableSteps((t) => present.has(t)).map((s) => s.target)).toEqual(["logo", "kim", "carteira", "rad", "equipe", "selo-simulado"]);
  });

  it("lembra a visita no localStorage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readTourSeen(storage)).toBe(false);
    writeTourSeen(storage);
    expect(data.get(TOUR_SEEN_KEY)).toBe("1");
    expect(readTourSeen(storage)).toBe(true);
  });

  it("não quebra quando o localStorage lança erro ou não existe", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readTourSeen(broken)).toBe(false);
    expect(() => writeTourSeen(broken)).not.toThrow();
    expect(readTourSeen(undefined)).toBe(false);
  });
});
