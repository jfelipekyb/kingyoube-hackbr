import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";
import { actorKind, listAudit, recordAudit, sanitizeDetails } from ".";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe("auditoria", () => {
  it("omite chaves sensíveis e converte bigint", () => {
    expect(sanitizeDetails({ token: "abc", nested: { CRON_SECRET: "x", cents: 10n } })).toEqual({
      token: "[omitido]",
      nested: { CRON_SECRET: "[omitido]", cents: "10" },
    });
  });

  it("rejeita ator fora do padrão", async () => {
    await expect(recordAudit(db, { actor: "fulano", action: "x", entity: "y", result: "ok" })).rejects.toThrow(/Ator/);
  });

  it("filtra por humano, agente e sistema", async () => {
    await recordAudit(db, { actor: "usuario:ana", action: "demo.papel", entity: "sessao", result: "ok" });
    await recordAudit(db, { actor: "agente:conciliador", action: "agente.conciliar", entity: "empresa", result: "ok" });
    await recordAudit(db, { actor: "sistema:cron", action: "demo.reset", entity: "base_demo", result: "ok" });
    expect((await listAudit(db, { kind: "humano" })).map((r) => r.actor)).toEqual(["usuario:ana"]);
    expect((await listAudit(db, { kind: "agente" })).map((r) => r.actor)).toEqual(["agente:conciliador"]);
    expect(await listAudit(db)).toHaveLength(3);
    expect(actorKind("agente:kim")).toBe("agente");
  });
});
