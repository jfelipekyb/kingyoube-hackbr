import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";
import { seedDemo } from "./seed";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("seed idempotente", () => {
  it("rodar duas vezes resulta em 12 clientes e 412 notas", async () => {
    const first = await seedDemo(db, { demoToday: "2026-11-20" });
    const second = await seedDemo(db, { demoToday: "2026-11-20" });
    expect(second).toEqual(first);
    expect(second).toMatchObject({ companies: 12, invoices: 412, users: 2, effortStandards: 7, docWatch: 9 });
    const [n] = await db.select({ n: count() }).from(s.invoices);
    expect(Number(n.n)).toBe(412);
  });

  it("guarda centavos como bigint e não cria solicitações, propostas nem rodadas", async () => {
    const [c2] = await db.select().from(s.invoices).where(eq(s.invoices.cbsCents, 43650n));
    expect(c2.cbsCents).toBe(43650n);
    for (const table of [s.rfbRequests, s.radProposals, s.outboundMessages, s.agentRuns, s.agentEvents]) {
      const [row] = await db.select({ n: count() }).from(table);
      expect(Number(row.n)).toBe(0);
    }
  });

  it("registra cada seed na auditoria, que é append-only", async () => {
    const rows = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "demo.seed"));
    expect(rows).toHaveLength(2);
    await expect(db.execute(sql`update audit_log set result = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
