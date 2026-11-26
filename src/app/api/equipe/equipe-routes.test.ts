import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const start = await import("./run/route");
const show = await import("./run/[runId]/route");
const step = await import("./run/[runId]/[agent]/route");

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: "2026-11-20" });
  vi.stubEnv("RECEITA_MODE", "SIMULADO");
  vi.stubEnv("SIMULADO_RAPIDO", "true");
  vi.stubEnv("DEMO_TODAY", "2026-11-20");
  vi.stubEnv("CRON_SECRET", "segredo-de-teste");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
}, 120_000);
afterAll(() => {
  vi.unstubAllEnvs();
  return close();
});

const post = () => new Request("http://localhost/api", { method: "POST" });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

describe("rotas da rodada da equipe", () => {
  it("REAL: abrir rodada e rodar agente exigem Bearer CRON_SECRET", async () => {
    vi.stubEnv("RECEITA_MODE", "REAL");
    expect((await start.POST(post())).status).toBe(401);
    expect((await step.POST(post(), ctx({ runId: "00000000-0000-0000-0000-000000000000", agent: "captura" }))).status).toBe(401);
    vi.stubEnv("RECEITA_MODE", "SIMULADO");
  });

  it("uma chamada por agente até o fim; GET mostra passos, horas e decisões", async () => {
    const res = await start.POST(post());
    expect(res.status).toBe(201);
    const { runId, agents } = (await res.json()) as { runId: string; agents: string[] };
    expect((await start.POST(post())).status).toBe(200);
    expect((await step.POST(post(), ctx({ runId, agent: "aprovador" }))).status).toBe(404);
    for (const agent of agents) {
      for (let i = 0; ; i++) {
        const r = (await (await step.POST(post(), ctx({ runId, agent }))).json()) as { done: boolean };
        if (r.done) break;
        if (i > 40) throw new Error(`${agent} não terminou`);
        await new Promise((ok) => setTimeout(ok, 400));
      }
    }
    const snap = (await (await show.GET(post(), ctx({ runId }))).json()) as {
      run: { status: string };
      steps: Record<string, { status: string; summary: string }>;
      decisions: { kind: string }[];
      timeline: unknown[];
    };
    expect(snap.run.status).toBe("concluida");
    expect(snap.steps.conferente).toMatchObject({ status: "revisado_ok", summary: "Conferi 413 de 413. Nenhuma diferença." });
    expect(snap.steps.kim.summary).toBe("Resumo pronto: 3 decisões esperam o contador.");
    expect(snap.decisions.map((d) => d.kind).sort()).toEqual(["divergencia", "rad", "rad"]);
    expect(snap.timeline.length).toBeGreaterThan(0);
    expect((await show.GET(post(), ctx({ runId: "x" }))).status).toBe(400);
  }, 120_000);
});
