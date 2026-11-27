import { describe, expect, it } from "vitest";
import { findCompanyId, findProposalId } from "./smoke-lib";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("smoke: leitura do HTML", () => {
  it("acha o cliente pelo início do nome, com comentários do React no meio", () => {
    const html = `<select><option value="${A}">Ateliê Pão &amp; Arte</option><option value="${B}">Padaria Boa Massa<!-- --> (FICTÍCIA)</option></select>`;
    expect(findCompanyId(html, "Padaria Boa Massa")).toBe(B);
    expect(findCompanyId(html, "Inexistente")).toBeNull();
  });

  it("acha a proposta pela linha com fornecedor e valor", () => {
    const html = `<table><tr><td>Forno Forte</td><td>R$ 800,00</td><td><a href="/rad/${A}">Abrir</a></td></tr><tr class="x"><td>Moinho Estrela</td><td>R$ 436,50</td><td><a href="/rad/${B}">Abrir</a></td></tr></table>`;
    expect(findProposalId(html, ["Moinho", "436,50"])).toBe(B);
    expect(findProposalId(html, ["Moinho", "999,00"])).toBeNull();
  });
});
