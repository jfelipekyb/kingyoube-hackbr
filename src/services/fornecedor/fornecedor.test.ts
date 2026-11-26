import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { MOINHO_SLUG } from "@/seed/demo-data";
import { supplierLights } from "@/services/semaforos";
import type { Scraper } from "@/services/vigia/scrape";
import { ScrapeNotAllowedError } from "@/services/vigia/scrape";
import { data, invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";
import { chargeState, findSupplierContact, notifySupplier, recordSupplierResponse, SupplierError } from "./index";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await syncedDb());
}, 120_000);
afterAll(() => close());

const moinho = data.counterparties.find((c) => c.slug === MOINHO_SLUG)!;
const ACTOR = "usuario:teste";
const env = { RECEITA_MODE: "SIMULADO", FORNECEDOR_EMAIL: "cobranca@kingyoube.exemplo" };
const fakeScraper = (json: unknown) => {
  const calls: string[] = [];
  const scraper: Scraper = { scrape: async (url) => (calls.push(url), { json }) };
  return { scraper, calls };
};

describe("Vigia e Mensageiro: contato e cobrança do fornecedor (docs/05, docs/11)", () => {
  it("URL fora da lista → recusada sem chamar o Firecrawl", async () => {
    await db.update(s.counterparties).set({ siteUrl: "https://golpe.exemplo/contato" }).where(eq(s.counterparties.id, moinho.id));
    const { scraper, calls } = fakeScraper({ cnpj: moinho.cnpj });
    await expect(findSupplierContact({ db, scraper, env: { ...env, APP_URL: "https://hack.exemplo" } }, moinho.id, ACTOR)).rejects.toBeInstanceOf(ScrapeNotAllowedError);
    expect(calls).toHaveLength(0);
  });

  it("CNPJ extraído diferente → contato não gravado", async () => {
    await db.update(s.counterparties).set({ siteUrl: `https://hack.exemplo/demo/fornecedores/${MOINHO_SLUG}` }).where(eq(s.counterparties.id, moinho.id));
    const { scraper, calls } = fakeScraper({ cnpj: "11.111.111/0001-11", emailFinanceiro: "outro@golpe.exemplo" });
    const r = await findSupplierContact({ db, scraper, env: { ...env, APP_URL: "https://hack.exemplo" } }, moinho.id, ACTOR);
    expect(r.status).toBe("cnpj_divergente");
    expect(calls).toHaveLength(1);
    const [cp] = await db.select().from(s.counterparties).where(eq(s.counterparties.id, moinho.id));
    expect(cp.financeEmail).toBeNull();
  });

  it("sem cobrança, o fornecedor não responde; sem contato, não há cobrança", async () => {
    await expect(notifySupplier({ db, env }, invoiceOf("C2").id, ACTOR)).rejects.toMatchObject({ code: "SEM_CONTATO" });
    await expect(recordSupplierResponse({ db }, { counterpartyId: moinho.id, response: "vou_recolher", actor: ACTOR })).rejects.toBeInstanceOf(SupplierError);
  });

  it("sem APP_URL público: contato do Moinho pela fixture, CNPJ conferido, fonte simulado", async () => {
    await db.update(s.counterparties).set({ siteUrl: `http://localhost:3000/demo/fornecedores/${MOINHO_SLUG}` }).where(eq(s.counterparties.id, moinho.id));
    const { scraper, calls } = fakeScraper({});
    const r = await findSupplierContact({ db, scraper, env: { ...env, APP_URL: "http://localhost:3000" } }, moinho.id, ACTOR);
    expect(r).toEqual({ status: "contato_encontrado", source: "simulado", emailLabel: "f•••@m•••.exemplo" });
    expect(calls).toHaveLength(0);
    const [cp] = await db.select().from(s.counterparties).where(eq(s.counterparties.id, moinho.id));
    expect(cp).toMatchObject({ financeEmail: "financeiro@moinhoestrela.exemplo", contactSource: "simulado" });
    expect(chargeState(cp.financeEmail, null)).toBe("contato_encontrado");
  });

  it("cobrança: Resend com Idempotency-Key cobranca-<invoiceId> para FORNECEDOR_EMAIL, WhatsApp simulado, e repetir não duplica", async () => {
    const c2 = invoiceOf("C2");
    const sent: { headers: Record<string, string>; body: string }[] = [];
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(JSON.stringify({ id: "email_cobranca" }), { status: 200 });
    }) as unknown as typeof fetch;
    const realEnv = { ...env, RESEND_API_KEY: "re_teste", RESEND_FROM: "equipe@kingyoube.exemplo" };
    const first = await notifySupplier({ db, env: realEnv, fetch: fakeFetch }, c2.id, ACTOR);
    const again = await notifySupplier({ db, env: realEnv, fetch: fakeFetch }, c2.id, ACTOR);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers["Idempotency-Key"]).toBe(`cobranca-${c2.id}`);
    const body = JSON.parse(sent[0].body) as { to: string[]; subject: string };
    expect(body.to).toEqual(["cobranca@kingyoube.exemplo"]);
    expect(body.subject).toBe("Recolhimento de CBS pendente — nota 1.284");
    expect(sent[0].body).not.toContain("re_teste");
    expect(first.email).toMatchObject({ lastStatus: "enviado", resendId: "email_cobranca", toLabel: "c•••@k•••.exemplo" });
    expect(again.email.id).toBe(first.email.id);
    expect(first.whatsapp).toMatchObject({ channel: "whatsapp", lastStatus: "simulado" });
    expect(again.whatsapp.id).toBe(first.whatsapp.id);
    const events = await db.select().from(s.agentEvents).where(eq(s.agentEvents.agent, "mensageiro"));
    expect(events.filter((e) => e.action === "cobranca_email")).toHaveLength(1);
    expect(chargeState("x@y.z", "delivered")).toBe("entregue");
  });

  it('respostas simuladas: "Não aceito o RAD" → recusa (vermelho); "Vou recolher" → aceita (amarelo); tudo na auditoria', async () => {
    await recordSupplierResponse({ db }, { counterpartyId: moinho.id, response: "nao_aceito", actor: ACTOR });
    let row = (await supplierLights(db, padaria.id)).find((r) => r.counterpartyId === moinho.id)!;
    expect(row).toMatchObject({ radAgreement: "recusa", light: "vermelho" });
    await recordSupplierResponse({ db }, { counterpartyId: moinho.id, response: "vou_recolher", actor: ACTOR });
    row = (await supplierLights(db, padaria.id)).find((r) => r.counterpartyId === moinho.id)!;
    expect(row.radAgreement).toBe("aceita");
    expect(row.light === "amarelo" || row.light === "verde").toBe(true);
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "fornecedor.resposta"));
    expect(audit.map((a) => a.result)).toEqual(["recusa", "aceita"]);
    const [cp] = await db.select().from(s.counterparties).where(eq(s.counterparties.id, moinho.id));
    expect(cp.radAgreementSource).toBe("simulado");
  });
});
