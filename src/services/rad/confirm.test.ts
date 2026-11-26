import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { ANALISTA, CONTADOR, env, invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";
import { confirmRadPayments } from "./confirm";
import { approveProposal, generateDarf, getProposal, prepareProposal, submitProposal } from "./index";

let db: Db;
let close: () => Promise<void>;
let sync: () => Promise<void>;
let darf: (scenario: string, aware?: boolean) => Promise<string>;
beforeAll(async () => {
  const f = await syncedDb();
  ({ db, close, sync } = f);
  darf = async (scenario, aware = false) => {
    const p = await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf(scenario).id, requestedBy: ANALISTA });
    await submitProposal(db, { id: p.id, companyId: padaria.id, actor: ANALISTA });
    await approveProposal(db, { id: p.id, companyId: padaria.id, actor: CONTADOR, awareOfRefusal: aware });
    await generateDarf({ db, adapter: f.deps.adapter }, { id: p.id, companyId: padaria.id, actor: CONTADOR });
    return p.id;
  };
}, 120_000);
afterAll(() => close());

describe("confirmação do RAD pelos recolhimentos (docs/04)", () => {
  it("C2: DARF gerado não é pago; depois de sincronizar recolhimentos → pago_confirmado, e repetir não muda nada", async () => {
    const id = await darf("C2");
    expect((await getProposal(db, id, padaria.id)).state).toBe("darf_gerado");
    await sync();
    const p = await getProposal(db, id, padaria.id);
    expect(p).toMatchObject({ state: "pago_confirmado", paidPrincipalCents: 43650n, divergenceRule: null });
    expect(p.confirmedAt).toBeInstanceOf(Date);
    expect(await confirmRadPayments({ db, env })).toEqual({ confirmed: 0, divergent: 0, expired: 0 });
  });

  it("valor recolhido diferente do DARF → pago_confirmado com divergência R07", async () => {
    const [c2] = await db.select().from(s.radProposals).where(eq(s.radProposals.invoiceId, invoiceOf("C2").id));
    await db.update(s.radProposals).set({ state: "darf_gerado", principalCents: 40000n, divergenceRule: null }).where(eq(s.radProposals.id, c2.id));
    expect(await confirmRadPayments({ db, env })).toMatchObject({ confirmed: 1, divergent: 1 });
    expect(await getProposal(db, c2.id, padaria.id)).toMatchObject({ state: "pago_confirmado", divergenceRule: "R07", paidPrincipalCents: 43650n });
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.entityId, c2.id));
    expect(audit.some((a) => a.result === "divergente_R07")).toBe(true);
  });

  it("vencimento passado sem recolhimento → vencida", async () => {
    const id = await darf("C3", true);
    await db.update(s.radProposals).set({ dueDate: "2026-11-19" }).where(eq(s.radProposals.id, id));
    expect(await confirmRadPayments({ db, env })).toMatchObject({ expired: 1 });
    expect((await getProposal(db, id, padaria.id)).state).toBe("vencida");
  });
});
