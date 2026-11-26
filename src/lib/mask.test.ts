import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask";

describe("maskEmail", () => {
  it("mostra só a primeira letra do usuário e do domínio", () => {
    expect(maskEmail("contato@empresa.exemplo")).toBe("c•••@e•••.exemplo");
    expect(maskEmail("a@b")).toBe("a•••@b•••");
  });
  it("nunca devolve o e-mail inteiro", () => {
    for (const e of ["ana.silva@escritorio.exemplo", "joao@financeiro.com.br"]) {
      const m = maskEmail(e)!;
      expect(m).not.toContain(e.split("@")[0]);
      expect(m).not.toContain(e);
    }
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("sem-arroba")).toBe("•••");
  });
});
