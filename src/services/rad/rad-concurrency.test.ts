import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { ANALISTA, invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";
import { prepareProposal } from "./index";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await syncedDb());
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
});
