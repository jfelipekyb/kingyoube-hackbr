import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickTarget, planStep, readTourSeen, TOUR_SEEN_KEY, TOUR_STEPS, writeTourSeen } from "./tour-steps";

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

  it("os 8 passos sempre aparecem: sem o alvo na tela, o passo navega até a página dele", () => {
    const has = (present: string[]) => (t: string) => present.includes(t);
    const steps = Object.fromEntries(TOUR_STEPS.map((s) => [s.target, s]));
    // Desktop em /rad: o menu lateral tem Kim, Carteira, RAD e Equipe; a Sala da Equipe não está na tela.
    const desktop = has(["logo", "kim", "carteira", "rad", "equipe", "selo-simulado"]);
    expect(TOUR_STEPS.map((s) => planStep(s, "/rad", desktop).kind)).toEqual(["show", "navigate", "navigate", "show", "show", "show", "show", "show"]);
    expect(planStep(steps["rodar-equipe"], "/rad", desktop)).toEqual({ kind: "navigate", href: "/" });
    // Celular: o menu fica recolhido, então os passos de menu vão para a tela e apontam o alvo dela.
    expect(planStep(steps.kim, "/", has(["logo"]))).toEqual({ kind: "navigate", href: "/kim" });
    expect(planStep(steps.kim, "/kim", has(["logo", "kim-tela"]))).toEqual({ kind: "show", target: "kim-tela" });
    expect(planStep(steps.rad, "/rad", has(["rad-fila"]))).toEqual({ kind: "show", target: "rad-fila" });
    expect(planStep(steps.equipe, "/equipe", has(["equipe-horas"]))).toEqual({ kind: "show", target: "equipe-horas" });
    // Já na página, mas ainda carregando: espera em vez de navegar de novo.
    expect(planStep(steps.carteira, "/carteira", has([]))).toEqual({ kind: "wait" });
    expect(TOUR_STEPS.every((s) => s.page || ["logo", "selo-simulado"].includes(s.target))).toBe(true);
  });

  it("os alvos de reserva existem nas telas", () => {
    expect(readFileSync("src/app/kim/kim-screen.tsx", "utf8")).toContain('data-tour="kim-tela"');
    expect(readFileSync("src/app/rad/page.tsx", "utf8")).toContain('data-tour="rad-fila"');
    expect(readFileSync("src/app/equipe/page.tsx", "utf8")).toContain('data-tour="equipe-horas"');
    expect(readFileSync("src/app/carteira/page.tsx", "utf8")).toContain('data-tour="carteira"');
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
