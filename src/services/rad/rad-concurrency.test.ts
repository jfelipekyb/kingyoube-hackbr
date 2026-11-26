import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { ReceitaAdapter } from "@/services/receita";
import { ANALISTA, CONTADOR, invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";
import { approveProposal, generateDarf, prepareProposal, RadError, submitProposal } from "./index";

let db: Db;
let close: () => Promise<void>;
let adapter: ReceitaAdapter;
beforeAll(async () => {
  const f = await syncedDb();
  ({ db, close } = f);
  adapter = f.deps.adapter;
}, 120_000);
afterAll(() => close());

const prep = (scenario: string) => prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf(scenario).id, requestedBy: ANALISTA });

describe("RAD sob concorrência (achados do PR #6)", () => {
  it("0b: preparar duas vezes ao mesmo tempo devolve a mesma proposta; o índice recusa uma segunda aberta", async () => {
    const [a, b] = await Promise.all([prep("C2"), prep("C2")]);
    expect(a.id).toBe(b.id);
    const rows = await db.select().from(s.radProposals).where(and(eq(s.radProposals.companyId, padaria.id), eq(s.radProposals.invoiceId, invoiceOf("C2").id)));
    expect(rows).toHaveLength(1);
    await expect(
      db.insert(s.radProposals).values({ companyId: padaria.id, invoiceId: a.invoiceId, accessKey: a.accessKey, option: "PAGAMENTO_TOTAL", justification: "x", preparedBy: "agente:tesouraria" }),
    ).rejects.toThrow();
  });

  it("0c: dois cliques simultâneos em gerar DARF chamam a Receita uma vez só", async () => {
    const p = await prep("C2");
    await submitProposal(db, { id: p.id, companyId: padaria.id, actor: ANALISTA });
    await approveProposal(db, { id: p.id, companyId: padaria.id, actor: CONTADOR });
    let calls = 0;
    const counting: ReceitaAdapter = {
      ...adapter,
      gerarDarfRad: async (...args) => {
        calls++;
        await new Promise((r) => setTimeout(r, 30));
        return adapter.gerarDarfRad(...args);
      },
    };
    const ctx = { id: p.id, companyId: padaria.id, actor: CONTADOR };
    const results = await Promise.allSettled([generateDarf({ db, adapter: counting }, ctx), generateDarf({ db, adapter: counting }, ctx)]);
    expect(calls).toBe(1);
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBeInstanceOf(RadError);
    expect((refused[0].reason as RadError).status).toBe(409);
    const [row] = await db.select().from(s.radProposals).where(eq(s.radProposals.id, p.id));
    expect(row.state).toBe("darf_gerado");
  });
});
