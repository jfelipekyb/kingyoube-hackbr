import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));

const { POST: prepare } = await import("./proposals/route");
const { POST: submit } = await import("./proposals/[id]/submit/route");
const { POST: approve } = await import("./proposals/[id]/approve/route");
const { POST: generate } = await import("./proposals/[id]/generate-darf/route");
const { POST: draft } = await import("./proposals/[id]/draft/route");

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

  it("C2 pela rota: Analista recebe 403 ao gerar DARF; contador gera e grava Pix, código de barras, PDF, vencimento e valores", async () => {
    const id = (await (await prepare(post({ companyId: padaria.id, invoiceId: invoiceOf("C2").id }, "analista"))).json()).proposta.id as string;
    await submit(post({ companyId: padaria.id }, "analista"), params(id));
    expect((await approve(post({ companyId: padaria.id }, "contador"), params(id))).status).toBe(200);
    const blocked = await generate(post({ companyId: padaria.id }, "analista"), params(id));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).erro).toBe("Só o contador pode gerar o DARF.");
    const res = await generate(post({ companyId: padaria.id }, "contador"), params(id));
    expect(res.status).toBe(200);
    const p = (await res.json()).proposta;
    expect(p).toMatchObject({ state: "darf_gerado", principalCents: "43650", totalCents: "43650", dueDate: "2026-11-30" });
    expect(p.darfPix && p.darfBarcode && p.darfPdfUrl).toBeTruthy();
  });

  it("parcial acima do DFE: a rota devolve a mensagem em português", async () => {
    const [row] = await db.select().from(s.radProposals).where(eq(s.radProposals.invoiceId, invoiceOf("C3").id));
    await db.update(s.radProposals).set({ state: "erro_receita" }).where(eq(s.radProposals.id, row.id));
    expect((await draft(post({ companyId: padaria.id, option: "PAGAMENTO_PARCIAL", partialCents: "90000", justification: "Parcial" }, "analista"), params(row.id))).status).toBe(200);
    await submit(post({ companyId: padaria.id }, "analista"), params(row.id));
    await approve(post({ companyId: padaria.id, awareOfRefusal: true }, "contador"), params(row.id));
    const body = await (await generate(post({ companyId: padaria.id }, "contador"), params(row.id))).json();
    expect(body).toMatchObject({ codigo: "VALOR_PARCIAL_SUPERIOR_DFE", proposta: { state: "erro_receita" } });
    expect(body.erro).toContain("maior que a CBS do documento fiscal");
  });

  it("sem companyId, 400", async () => {
    expect((await prepare(post({ invoiceId: invoiceOf("C2").id }, "analista"))).status).toBe(400);
  });
});
