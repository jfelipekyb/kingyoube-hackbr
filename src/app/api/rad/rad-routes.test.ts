import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));

const { POST: prepare } = await import("./proposals/route");
const { POST: submit } = await import("./proposals/[id]/submit/route");
const { POST: approve } = await import("./proposals/[id]/approve/route");

beforeAll(async () => {
  ({ db, close } = await syncedDb());
  vi.stubEnv("RECEITA_MODE", "SIMULADO");
}, 120_000);
afterAll(() => close());

const post = (body: unknown, role: "analista" | "contador") =>
  new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { cookie: `demo_papel=${role}` } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("rotas de RAD", () => {
  it("fornecedor vermelho: aprovar sem 'Estou ciente da recusa do fornecedor' responde 409; com ela, 200", async () => {
    const res = await prepare(post({ companyId: padaria.id, invoiceId: invoiceOf("C3").id }, "analista"));
    expect(res.status).toBe(200);
    const id = (await res.json()).proposta.id as string;
    expect((await submit(post({ companyId: padaria.id }, "analista"), params(id))).status).toBe(200);
    const denied = await approve(post({ companyId: padaria.id }, "contador"), params(id));
    expect(denied.status).toBe(409);
    expect((await denied.json()).erro).toContain("Estou ciente da recusa do fornecedor");
    expect((await approve(post({ companyId: padaria.id, awareOfRefusal: true }, "analista"), params(id))).status).toBe(403);
    const ok = await approve(post({ companyId: padaria.id, awareOfRefusal: true }, "contador"), params(id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).proposta.state).toBe("aprovada");
  });

  it("sem companyId, 400", async () => {
    expect((await prepare(post({ invoiceId: invoiceOf("C2").id }, "analista"))).status).toBe(400);
  });
});
