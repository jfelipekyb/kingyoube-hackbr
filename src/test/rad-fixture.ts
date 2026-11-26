// Base do seed sincronizada (Receita SIMULADA) para os testes de RAD e Mensageiro.
import type { Db } from "@/db/types";
import { createReceitaAdapter, pollRequests, syncPortfolio, type ApuracaoDeps } from "@/services/receita";
import { buildDemoData, DEMO_USERS } from "@/seed/demo-data";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "./db";

export const DEMO_TODAY = "2026-11-20";
export const env = { RECEITA_MODE: "SIMULADO", DEMO_TODAY };
export const data = buildDemoData(DEMO_TODAY);
export const padaria = data.companies.find((c) => c.slug === "padaria-boa-massa")!;
export const other = data.companies.find((c) => c.slug !== "padaria-boa-massa")!;
export const invoiceOf = (scenario: string) => data.invoices.find((i) => i.scenario === scenario)!;
export const ANALISTA = `usuario:${DEMO_USERS.find((u) => u.role === "analista")!.id}`;
export const CONTADOR = `usuario:${DEMO_USERS.find((u) => u.role === "contador")!.id}`;

export async function syncedDb(): Promise<{ db: Db; close: () => Promise<void>; sync: () => Promise<void>; deps: ApuracaoDeps }> {
  const { db, close } = await createTestDb();
  await seedDemo(db, { demoToday: DEMO_TODAY });
  const clock = { t: Date.UTC(2026, 10, 25, 15) };
  const now = () => new Date(clock.t);
  const deps: ApuracaoDeps = { db, adapter: createReceitaAdapter(db, env, { now }), env, now };
  const sync = async () => {
    await syncPortfolio(deps);
    for (let i = 0; i < 20; i++) {
      clock.t += 2_000;
      await pollRequests(deps);
    }
  };
  await sync();
  return { db, close, sync, deps };
}
