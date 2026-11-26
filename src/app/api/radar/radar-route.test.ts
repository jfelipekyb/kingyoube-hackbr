import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const { GET, POST } = await import("./check/route");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  vi.stubEnv("CRON_SECRET", "segredo-de-teste");
  vi.stubEnv("FIRECRAWL_API_KEY", "");
}, 60_000);
afterAll(() => close());

describe("POST /api/radar/check", () => {
  it("sem Bearer CRON_SECRET (ou com o errado) → 401, sem chamar o Firecrawl", async () => {
    expect((await POST(new Request("http://localhost/api/radar/check", { method: "POST" }))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/radar/check", { headers: { authorization: "Bearer errado" } }))).status).toBe(401);
  });
  it("com o segredo passa da trava (sem FIRECRAWL_API_KEY responde 503)", async () => {
    expect((await POST(new Request("http://localhost/api/radar/check", { method: "POST", headers: { authorization: "Bearer segredo-de-teste" } }))).status).toBe(503);
  });
});
