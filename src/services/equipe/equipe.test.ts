import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentEvents, auditLog } from "@/db/schema";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";
import { recordAgentEvent } from ".";
import type { AgentKey } from "./agents";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe("recordAgentEvent", () => {
  it("grava o evento do agente e a linha de auditoria correspondente", async () => {
    const event = await recordAgentEvent(db, {
      agent: "conciliador",
      action: "conciliar",
      entity: "empresa",
      entityId: "padaria",
      status: "feito",
      summary: "Conferi 50 notas da Padaria Boa Massa",
      count: 50,
      minutesSaved: 150,
    });
    const [stored] = await db.select().from(agentEvents).where(eq(agentEvents.id, event.id));
    expect(stored).toMatchObject({ agent: "conciliador", count: 50, minutesSaved: 150, status: "feito" });
    const audit = await db.select().from(auditLog).where(eq(auditLog.actor, "agente:conciliador"));
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("agente.conciliar");
  });

  it("recusa agente desconhecido, resumo vazio e contagem negativa", async () => {
    const base = { action: "x", entity: "y", status: "feito" as const, summary: "ok" };
    await expect(recordAgentEvent(db, { ...base, agent: "robo" as AgentKey })).rejects.toThrow(/desconhecido/);
    await expect(recordAgentEvent(db, { ...base, agent: "kim", summary: " " })).rejects.toThrow(/resumo/);
    await expect(recordAgentEvent(db, { ...base, agent: "kim", count: -1 })).rejects.toThrow(/inteiros/);
  });
});
