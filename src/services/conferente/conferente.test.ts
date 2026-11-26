import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcilePortfolio } from "@/services/conciliacao";
import { env, syncedDb } from "@/test/rad-fixture";
import { reviewPortfolio, reviewSummary, textToCents } from "./index";

let db: Db;
let close: () => Promise<void>;
let now: Date;

beforeAll(async () => {
  const fx = await syncedDb();
  ({ db, close } = fx);
  now = fx.deps.now!();
  await reconcilePortfolio({ db, env, now, rewriter: null });
});
afterAll(() => close());

describe("Conferente (docs/04)", () => {
  it("não importa nada do módulo conciliacao/", () => {
    const src = readFileSync(path.join(__dirname, "index.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*conciliacao/);
  });

  it("converte o texto da Receita em centavos sem float", () => {
    expect(textToCents("128.27")).toBe(12827n);
    expect(textToCents("0.1")).toBe(10n);
    expect(textToCents("12")).toBe(1200n);
    expect(() => textToCents("1.234")).toThrow();
  });

  it("seed: confere 413 de 413, nenhuma diferença, todos revisado_ok", async () => {
    const r = await reviewPortfolio({ db, env, now });
    expect(r.summary).toBe("Conferi 413 de 413. Nenhuma diferença.");
    expect(r.divergent).toHaveLength(0);
    const items = await db.select().from(s.reconciliationItems);
    expect(items).toHaveLength(413);
    expect(items.every((i) => i.reviewStatus === "revisado_ok")).toBe(true);
  });

  it("item alterado de propósito vira revisado_divergente, com evento e auditoria, e o Conferente não corrige", async () => {
    const [target] = await db.select().from(s.reconciliationItems).where(eq(s.reconciliationItems.status, "divergente_valor"));
    await db.update(s.reconciliationItems).set({ status: "conciliado", diffCents: 0n }).where(eq(s.reconciliationItems.id, target.id));

    const r = await reviewPortfolio({ db, env, now });
    expect(r.summary).toBe(reviewSummary(413, 413, 1));
    expect(r.divergent.map((d) => d.itemId)).toEqual([target.id]);
    expect(r.divergent[0].recomputed).toEqual({ status: "divergente_valor", diffCents: target.diffCents });

    const [after] = await db.select().from(s.reconciliationItems).where(eq(s.reconciliationItems.id, target.id));
    expect(after.reviewStatus).toBe("revisado_divergente");
    expect(after.status).toBe("conciliado");
    expect(after.diffCents).toBe(0n);
    expect(after.reviewNote).toContain("divergente_valor");

    const others = await db.select().from(s.reconciliationItems).where(eq(s.reconciliationItems.reviewStatus, "revisado_ok"));
    expect(others).toHaveLength(412);
    const ev = await db
      .select()
      .from(s.agentEvents)
      .where(and(eq(s.agentEvents.agent, "conferente"), eq(s.agentEvents.entityId, target.id)));
    expect(ev.map((e) => e.status)).toEqual(["revisado_divergente"]);
    const audit = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "conferente.divergencia"), eq(s.auditLog.entityId, target.id)));
    expect(audit).toHaveLength(1);
  });

  it("nova conciliação limpa a marca do Conferente até a próxima conferência", async () => {
    await reconcilePortfolio({ db, env, now, rewriter: null });
    const pending = await db.select().from(s.reconciliationItems).where(isNull(s.reconciliationItems.reviewStatus));
    expect(pending).toHaveLength(413);
    const r = await reviewPortfolio({ db, env, now });
    expect(r.divergent).toHaveLength(0);
  });
});
