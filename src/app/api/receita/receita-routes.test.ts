import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { buildDemoData } from "@/seed/demo-data";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));

const webhook = await import("./webhook/[requestId]/[nonce]/route");
const { POST: sync } = await import("./sync/route");
const { POST: poll } = await import("./poll/route");
const { newWebhookNonce } = await import("@/services/receita/webhook-nonce");

const padaria = buildDemoData("2026-11-20").companies[0];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: "2026-11-20" });
  vi.stubEnv("RECEITA_MODE", "SIMULADO");
});
afterAll(() => close());

const params = (requestId: string, nonce: string) => ({ params: Promise.resolve({ requestId, nonce }) });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers });

async function openRequest(ticket = `SIMULADO-debitos-${padaria.cnpjRoot}-${(Date.now() - 10_000).toString(36)}-0000000000000000`) {
  const { nonce, hash } = newWebhookNonce();
  const [row] = await db
    .insert(s.rfbRequests)
    .values({ companyId: padaria.id, service: "debitos", ticket, state: "solicitada", mode: "SIMULADO", webhookNonceHash: hash })
    .returning();
  return { row, nonce };
}

const webhookAudit = () => db.select().from(s.auditLog).where(eq(s.auditLog.action, "receita.webhook"));

describe("webhook /api/receita/webhook/[requestId]/[nonce]", () => {
  it("nonce errado → 404 e auditoria", async () => {
    const { row } = await openRequest();
    const res = await webhook.POST(post({ tiqueteSolicitacao: row.ticket, situacao: "CONCLUIDA" }), params(row.id, "errado"));
    expect(res.status).toBe(404);
    expect((await webhook.HEAD(new Request("http://localhost/x", { method: "HEAD" }), params(row.id, "errado"))).status).toBe(404);
    expect((await webhookAudit()).some((a) => a.result === "nonce_invalido")).toBe(true);
  });

  it("id que não é UUID → 404", async () => {
    expect((await webhook.POST(post({}), params("nao-uuid", "x"))).status).toBe(404);
  });

  it("tíquete desconhecido → 400 e auditoria; corpo e nonce nunca vão para a auditoria", async () => {
    const { row, nonce } = await openRequest();
    expect((await webhook.HEAD(new Request("http://localhost/x", { method: "HEAD" }), params(row.id, nonce))).status).toBe(200);
    const res = await webhook.POST(post({ tiqueteSolicitacao: "OUTRO-TIQUETE-SECRETO", situacao: "CONCLUIDA" }), params(row.id, nonce));
    expect(res.status).toBe(400);
    const audit = await webhookAudit();
    expect(audit.some((a) => a.result === "tiquete_desconhecido" && a.entityId === row.id)).toBe(true);
    const dump = JSON.stringify(await db.select().from(s.auditLog));
    expect(dump).not.toContain("OUTRO-TIQUETE-SECRETO");
    expect(dump).not.toContain(nonce);
  });

  it("solicitação já encerrada → 400", async () => {
    const { row, nonce } = await openRequest();
    await db.update(s.rfbRequests).set({ state: "normalizada" }).where(eq(s.rfbRequests.id, row.id));
    expect((await webhook.POST(post({ tiqueteSolicitacao: row.ticket, situacao: "CONCLUIDA" }), params(row.id, nonce))).status).toBe(400);
  });

  it("nonce certo e tíquete certo → 200; confere a situação antes de baixar", async () => {
    const { row, nonce } = await openRequest();
    const res = await webhook.POST(post({ tiqueteSolicitacao: row.ticket, situacao: "CONCLUIDA" }), params(row.id, nonce));
    expect(res.status).toBe(200);
    expect((await webhookAudit()).some((a) => a.result === "aviso_ok")).toBe(true);
    const [after] = await db.select().from(s.rfbRequests).where(eq(s.rfbRequests.id, row.id));
    expect(after.state).toBe("normalizada");
  });

  it("guarda só o hash do nonce", async () => {
    const { row, nonce } = await openRequest();
    const [stored] = await db.select().from(s.rfbRequests).where(eq(s.rfbRequests.id, row.id));
    expect(stored.webhookNonceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(nonce);
  });
});

describe("rotas sync e poll", () => {
  it("sync de um cliente abre os 4 serviços e poll devolve o andamento", async () => {
    await db.delete(s.rfbRawFiles);
    await db.delete(s.rfbRequests);
    const opened = await sync(post({ companyId: padaria.id }));
    expect(opened.status).toBe(200);
    const body = await opened.json();
    expect(body.results[0].results.map((r: { status: string }) => r.status)).toEqual(["aberta", "aberta", "aberta", "aberta"]);
    const res = await poll(post({ companyId: padaria.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).overview.companies).toHaveLength(1);
  });

  it("companyId inválido → 400", async () => {
    expect((await sync(post({ companyId: "x" }))).status).toBe(400);
  });

  it("SIMULADO: sync e poll abertos para a demo pública, sem Authorization", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-operador");
    expect((await poll(post({ companyId: padaria.id }))).status).toBe(200);
  });

  it("REAL: sync e poll sem Bearer do CRON_SECRET → 401, sem tocar na base", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    vi.stubEnv("CRON_SECRET", "segredo-operador");
    try {
      const [before] = await db.select({ n: count() }).from(s.rfbRequests);
      for (const route of [sync, poll]) {
        expect((await route(post({ companyId: padaria.id }))).status).toBe(401);
        expect((await route(post({ companyId: padaria.id }, { authorization: "Bearer outro" }))).status).toBe(401);
      }
      const [after] = await db.select({ n: count() }).from(s.rfbRequests);
      expect(after.n).toBe(before.n);
    } finally {
      vi.stubEnv("RECEITA_MODE", "SIMULADO");
    }
  });

  it("REAL: sem CRON_SECRET configurado nada passa", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    vi.stubEnv("CRON_SECRET", "");
    try {
      expect((await sync(post({}, { authorization: "Bearer " }))).status).toBe(401);
    } finally {
      vi.stubEnv("RECEITA_MODE", "SIMULADO");
    }
  });

  it("REAL com o Bearer certo passa da trava; sem RFB_* → 503 sem chamar nada", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    vi.stubEnv("CRON_SECRET", "segredo-operador");
    try {
      const auth = { authorization: "Bearer segredo-operador" };
      expect((await sync(post({ companyId: padaria.id }, auth))).status).toBe(503);
      expect((await poll(post({ companyId: padaria.id }, auth))).status).toBe(503);
    } finally {
      vi.stubEnv("RECEITA_MODE", "SIMULADO");
    }
  });
});
