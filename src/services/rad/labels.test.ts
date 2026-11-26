import { describe, expect, it } from "vitest";
import { decisionView } from "./labels";

const ANA = "usuario:ana";
const CARLOS = "usuario:carlos";
const draft = { state: "rascunho" as const, preparedBy: "agente:tesouraria", submittedBy: null };

describe("tela do RAD: só o Analista envia; o contador decide o que outra pessoa enviou", () => {
  it("rascunho: Analista vê enviar; Contador não vê enviar nem aprovar direto, e vê a razão", () => {
    expect(decisionView(draft, { role: "analista", actor: ANA })).toEqual({ canSubmit: true, canDecide: false, blockedReason: null });
    const c = decisionView(draft, { role: "contador", actor: CARLOS });
    expect(c.canSubmit).toBe(false);
    expect(c.canDecide).toBe(false);
    expect(c.blockedReason).toContain("quem envia não decide");
  });

  it("aguardando: Contador decide o que o Analista enviou; não decide o que ele mesmo enviou", () => {
    expect(decisionView({ ...draft, state: "aguardando_aprovacao", submittedBy: ANA }, { role: "contador", actor: CARLOS })).toEqual({ canSubmit: false, canDecide: true, blockedReason: null });
    const own = decisionView({ ...draft, state: "aguardando_aprovacao", submittedBy: CARLOS }, { role: "contador", actor: CARLOS });
    expect(own.canDecide).toBe(false);
    expect(own.blockedReason).toContain("quem envia não decide");
    expect(decisionView({ ...draft, state: "aguardando_aprovacao", submittedBy: ANA }, { role: "analista", actor: ANA }).canDecide).toBe(false);
  });
});
