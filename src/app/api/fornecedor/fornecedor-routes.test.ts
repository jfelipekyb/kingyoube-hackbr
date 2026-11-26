import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { MOINHO_SLUG } from "@/seed/demo-data";
import { data, invoiceOf, syncedDb } from "@/test/rad-fixture";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const contato = await import("./[id]/contato/route");
const cobrar = await import("./[id]/cobrar/route");
const resposta = await import("./[id]/resposta/route");

beforeAll(async () => {
  ({ db, close } = await syncedDb());
  vi.stubEnv("CRON_SECRET", "segredo-de-teste");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("APP_URL", "");
}, 120_000);
afterAll(() => close());

const moinho = data.counterparties.find((c) => c.slug === MOINHO_SLUG)!;
const ctx = { params: Promise.resolve({ id: moinho.id }) };
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("rotas de contato e cobrança do fornecedor", () => {
  it("REAL: buscar contato e cobrar exigem Bearer CRON_SECRET; resposta simulada recusada", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    expect((await contato.POST(req({}), ctx)).status).toBe(401);
    expect((await cobrar.POST(req({ invoiceId: invoiceOf("C2").id }, { authorization: "Bearer errado" }), ctx)).status).toBe(401);
    expect((await resposta.POST(req({ resposta: "vou_recolher" }), ctx)).status).toBe(403);
    vi.stubEnv("RECEITA_MODE", "SIMULADO");
  });

  it("SIMULADO: contato pela fixture → cobrança (1/min por IP) → resposta do fornecedor", async () => {
    const c = await contato.POST(req({}), ctx);
    expect(await c.json()).toMatchObject({ status: "contato_encontrado", source: "simulado", emailLabel: "f•••@m•••.exemplo" });
    const ip = { "x-forwarded-for": "203.0.113.50" };
    const first = await cobrar.POST(req({ invoiceId: invoiceOf("C2").id }, ip), ctx);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ email: { status: "simulado" }, whatsapp: { status: "simulado" } });
    expect((await cobrar.POST(req({ invoiceId: invoiceOf("C2").id }, ip), ctx)).status).toBe(429);
    const r = await resposta.POST(req({ resposta: "nao_aceito" }), ctx);
    expect(await r.json()).toEqual({ radAcordo: "recusa" });
    expect((await resposta.POST(req({ resposta: "talvez" }), ctx)).status).toBe(400);
  });
});
