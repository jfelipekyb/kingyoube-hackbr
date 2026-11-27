import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableSteps, pickTarget, readTourSeen, TOUR_SEEN_KEY, TOUR_STEPS, writeTourSeen } from "./tour-steps";

describe("tour guiado (docs/10, seção 5)", () => {
  it("tem os 8 passos na ordem do documento", () => {
    expect(TOUR_STEPS.map((s) => s.target)).toEqual(["logo", "rodar-equipe", "conferente", "kim", "carteira", "rad", "equipe", "selo-simulado"]);
  });

  it("passos 2 e 3 apontam para a Sala da Equipe (página inicial)", () => {
    const sala = readFileSync("src/app/sala-da-equipe.tsx", "utf8");
    expect(sala).toContain('data-tour="rodar-equipe"');
    expect(sala).toContain('data-tour={isConferente ? "conferente" : undefined}');
    expect(TOUR_STEPS[1].text).toBe("Clique aqui e veja a equipe trabalhar: capturar notas, buscar a apuração na Receita, conciliar e conferir.");
    expect(TOUR_STEPS[2].text).toBe("O Conferente refaz tudo do zero. Nenhum agente aprova o próprio trabalho.");
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

describe("pickTarget", () => {
  it("prefere o elemento da tela ao do menu, se visível", () => {
    expect(pickTarget(["menu", "tabela"], () => true)).toBe("tabela");
    expect(pickTarget(["menu", "tabela"], (e) => e === "menu")).toBe("menu");
    expect(pickTarget(["menu"], () => false)).toBeNull();
  });
});
