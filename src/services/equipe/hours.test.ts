import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { DEMO_USERS } from "@/seed/demo-data";
import { EFFORT_STANDARDS } from "@/seed/effort";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { hoursFromCounts, projectHours, returnedHours } from "./hours";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const route = await import("@/app/api/equipe/premissas/route");

const [ana, carlos] = DEMO_USERS;
// Contagens de uma rodada do seed (docs/09): 48 arquivos, 413 itens, 8 explicações, 2 guias, 9 páginas, 1 contato, 2 e-mails.
const COUNTS = { clientes: 12, sincronizar_servico: 48, conferir_nota: 413, investigar_divergencia: 8, preparar_rad: 2, ler_documentacao: 9, achar_contato: 1, escrever_email: 2 };

const patch = (role: string, body: unknown) =>
  route.PATCH(new Request("http://localhost/api/equipe/premissas", { method: "PATCH", headers: { cookie: `demo_papel=${role}` }, body: JSON.stringify(body) }));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: "2026-11-20" });
  await db.insert(s.agentRuns).values({ triggeredBy: "usuario:teste", status: "concluida", finishedAt: new Date(), counts: COUNTS });
}, 120_000);
afterAll(() => close());

describe("Horas devolvidas e projeção (docs/06, docs/09)", () => {
  it("horas = Σ contagem × minutos ÷ 60 com as premissas do seed", async () => {
    const expected = EFFORT_STANDARDS.reduce((a, e) => a + (COUNTS[e.task as keyof typeof COUNTS] ?? 0) * e.minutes, 0) / 60;
    expect(expected).toBeCloseTo(1974 / 60, 10);
    const h = await returnedHours(db);
    expect(h.lastRun?.minutes).toBe(1974);
    expect(h.lastRun?.hours).toBe(1974 / 60);
    expect(h.lastRun?.lines.find((l) => l.task === "conferir_nota")).toMatchObject({ count: 413, minutesEach: 3, minutes: 1239 });
    expect(h.clientsInRun).toBe(12);
    expect(h.projection).toEqual({ clients: 200, monthlyHours: (1974 / 60 / 12) * 200, fte: ((1974 / 60 / 12) * 200) / 168 });
    expect(hoursFromCounts({}, EFFORT_STANDARDS).hours).toBe(0);
    expect(projectHours(10, 0).monthlyHours).toBe(0);
  });

  it("Analista não muda premissa (403, auditado como negado)", async () => {
    const res = await patch("analista", { tipo: "tarefa", chave: "conferir_nota", valor: 4 });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(s.effortStandards).where(eq(s.effortStandards.task, "conferir_nota"));
    expect(row.minutes).toBe(3);
    const denied = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "equipe.premissa"), eq(s.auditLog.result, "negado")));
    expect(denied[0]).toMatchObject({ actor: `usuario:${ana.id}`, entityId: "conferir_nota" });
  });

  it("Contador muda uma premissa e as horas recalculam, com auditoria de → para", async () => {
    const res = await patch("contador", { tipo: "tarefa", chave: "conferir_nota", valor: 4 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.horas.lastRun.minutes).toBe(1974 + 413);
    expect((await returnedHours(db)).lastRun?.hours).toBe((1974 + 413) / 60);
    const [audit] = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "equipe.premissa"), eq(s.auditLog.result, "ok")));
    expect(audit).toMatchObject({ actor: `usuario:${carlos.id}`, entity: "effort_standard", entityId: "conferir_nota", details: { de: 3, para: 4 } });
  });

  it("premissas da projeção (clientes, rodadas por mês) recalculam a projeção", async () => {
    expect((await patch("contador", { tipo: "projecao", chave: "clientes_projecao", valor: 400 })).status).toBe(200);
    expect((await patch("contador", { tipo: "projecao", chave: "rodadas_por_mes", valor: 2 })).status).toBe(200);
    const h = await returnedHours(db);
    const hours = (1974 + 413) / 60;
    expect(h.projection.clients).toBe(400);
    expect(h.projection.monthlyHours).toBe((hours / 12) * 400 * 2);
    expect(h.projection.fte).toBe((hours / 12) * 400 * 2 / 168);
  });

  it("valor inválido ou premissa inexistente são recusados", async () => {
    expect((await patch("contador", { tipo: "tarefa", chave: "conferir_nota", valor: 0 })).status).toBe(400);
    expect((await patch("contador", { tipo: "tarefa", chave: "conferir_nota", valor: 2.5 })).status).toBe(400);
    expect((await patch("contador", { tipo: "tarefa", chave: "nao_existe", valor: 5 })).status).toBe(404);
    expect((await patch("contador", { tipo: "outro", chave: "x", valor: 1 })).status).toBe(400);
  });
});
