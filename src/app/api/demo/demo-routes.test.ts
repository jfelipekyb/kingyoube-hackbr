import { count } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, invoices } from "@/db/schema";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));

const { POST: reset, GET: resetGet } = await import("./reset/route");
const { POST: reiniciar } = await import("./reiniciar/route");

beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());
afterEach(() => vi.unstubAllEnvs());

const req = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { method: "POST", headers });

describe("POST /api/demo/reset", () => {
  it("sem CRON_SECRET configurado → 401", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await reset(req("/api/demo/reset", { authorization: "Bearer " }))).status).toBe(401);
  });

  it("sem cabeçalho ou com segredo errado → 401 (POST e GET)", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    expect((await reset(req("/api/demo/reset"))).status).toBe(401);
    expect((await reset(req("/api/demo/reset", { authorization: "Bearer outro" }))).status).toBe(401);
    expect((await resetGet(req("/api/demo/reset"))).status).toBe(401);
  });

  it("em modo REAL → 409 sem tocar na base, mesmo com o segredo certo (POST e GET)", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    vi.stubEnv("RECEITA_MODE", "REAL");
    const marker = await db.select({ n: count() }).from(auditLog);
    const auth = { authorization: "Bearer segredo-de-teste" };
    expect((await reset(req("/api/demo/reset", auth))).status).toBe(409);
    expect((await resetGet(req("/api/demo/reset", auth))).status).toBe(409);
    expect((await reset(req("/api/demo/reset"))).status).toBe(409);
    const [audit] = await db.select({ n: count() }).from(auditLog);
    expect(audit.n).toBe(marker[0].n);
  });

  it("com o segredo certo recria a base", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    const res = await reset(req("/api/demo/reset", { authorization: "Bearer segredo-de-teste" }));
    expect(res.status).toBe(200);
    expect((await res.json()).counts).toMatchObject({ companies: 12, invoices: 412 });
  });
});

describe("POST /api/demo/reiniciar", () => {
  it("2× no mesmo minuto pelo mesmo IP → 429; outro IP passa", async () => {
    vi.stubEnv("RECEITA_MODE", "SIMULADO");
    const first = await reiniciar(req("/api/demo/reiniciar", { "x-forwarded-for": "203.0.113.7" }));
    expect(first.status).toBe(200);
    const second = await reiniciar(req("/api/demo/reiniciar", { "x-forwarded-for": "203.0.113.7" }));
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const other = await reiniciar(req("/api/demo/reiniciar", { "x-forwarded-for": "198.51.100.2" }));
    expect(other.status).toBe(200);
    const [n] = await db.select({ n: count() }).from(invoices);
    expect(Number(n.n)).toBe(412);
  });

  it("2 chamadas simultâneas do mesmo IP → só uma reinicia", async () => {
    vi.stubEnv("RECEITA_MODE", "SIMULADO");
    const headers = { "x-forwarded-for": "192.0.2.50" };
    const results = await Promise.all([reiniciar(req("/api/demo/reiniciar", headers)), reiniciar(req("/api/demo/reiniciar", headers))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
  });

  it("não guarda o IP em claro na auditoria", async () => {
    const rows = await db.select().from(auditLog);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("em modo REAL → 409 sem tocar na base", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    const before = await db.select({ n: count() }).from(auditLog);
    expect((await reiniciar(req("/api/demo/reiniciar", { "x-forwarded-for": "192.0.2.1" }))).status).toBe(409);
    const after = await db.select({ n: count() }).from(auditLog);
    expect(after[0].n).toBe(before[0].n);
  });
});
