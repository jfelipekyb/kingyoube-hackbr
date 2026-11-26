import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { approveProposal, generateDarf, prepareProposal, submitProposal } from "@/services/rad";
import { ANALISTA, CONTADOR, invoiceOf, padaria, syncedDb } from "@/test/rad-fixture";
import { messagesFor, recordEmailEvent, refreshEmailStatus, sendDarfEmail, sendDarfMessages } from "./index";
import { signSvix, verifySvix } from "./svix";

let db: Db;
let close: () => Promise<void>;
let proposalId: string;
const FAKE_TO = "financeiro.teste@exemplo.com";

beforeAll(async () => {
  const f = await syncedDb();
  ({ db, close } = f);
  const p = await prepareProposal(db, { companyId: padaria.id, invoiceId: invoiceOf("C2").id, requestedBy: ANALISTA });
  await submitProposal(db, { id: p.id, companyId: padaria.id, actor: ANALISTA });
  await approveProposal(db, { id: p.id, companyId: padaria.id, actor: CONTADOR });
  await generateDarf({ db, adapter: f.deps.adapter }, { id: p.id, companyId: padaria.id, actor: CONTADOR });
  proposalId = p.id;
}, 120_000);
afterAll(() => close());

describe("Mensageiro: e-mail (Resend) e WhatsApp (SIMULADO)", () => {
  it("sem RESEND_API_KEY: e-mail simulado, sem chamar a rede; WhatsApp simulado; reenviar não duplica", async () => {
    const fetchMock = vi.fn();
    const env = { FINANCEIRO_EMAIL: FAKE_TO };
    const first = await sendDarfMessages({ db, env, fetch: fetchMock as unknown as typeof fetch }, proposalId, CONTADOR);
    await sendDarfMessages({ db, env, fetch: fetchMock as unknown as typeof fetch }, proposalId, CONTADOR);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.email).toMatchObject({ channel: "email", lastStatus: "simulado", idempotencyKey: `darf-${proposalId}`, toLabel: "f•••@e•••.com" });
    expect(first.whatsapp).toMatchObject({ channel: "whatsapp", lastStatus: "simulado" });
    expect(first.whatsapp.body).toContain("R$ 436,50");
    expect(first.whatsapp.body).not.toMatch(/\+?55\s?\d{2}\s?9?\d{4}-?\d{4}/);
    expect(await messagesFor(db, proposalId)).toHaveLength(2);
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "mensagem.whatsapp_darf"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(await db.select().from(s.auditLog))).not.toContain(FAKE_TO);
  });

  it("com RESEND_API_KEY: POST /emails com Idempotency-Key darf-<id>; status pelo GET /emails/{id} (last_event)", async () => {
    await db.delete(s.outboundMessages).where(eq(s.outboundMessages.channel, "email"));
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
      return new Response(JSON.stringify({ id: "re_123", last_event: "delivered" }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { RESEND_API_KEY: "re_teste", RESEND_FROM: "KingYouBe <cbs@exemplo.com>", FINANCEIRO_EMAIL: FAKE_TO };
    const msg = await sendDarfEmail({ db, env, fetch: fetchMock }, proposalId, CONTADOR);
    expect(msg).toMatchObject({ resendId: "re_123", lastStatus: "enviado" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(`darf-${proposalId}`);
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ to: [FAKE_TO], subject: expect.stringContaining("DARF do RAD") });
    await sendDarfEmail({ db, env, fetch: fetchMock }, proposalId, CONTADOR);
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
    expect(await refreshEmailStatus({ db, env, fetch: fetchMock }, msg)).toMatchObject({ lastStatus: "delivered" });
    expect(calls[calls.length - 1].url).toBe("https://api.resend.com/emails/re_123");
  });

  it("webhook: evento verificado grava email_events (só o hash) e atualiza o status", async () => {
    const raw = JSON.stringify({ type: "email.opened", data: { email_id: "re_123" } });
    expect(await recordEmailEvent(db, raw)).toEqual({ type: "email.opened", matched: true });
    const [ev] = await db.select().from(s.emailEvents);
    expect(ev.rawHash).toMatch(/^[0-9a-f]{64}$/);
    const [msg] = await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.resendId, "re_123"));
    expect(msg.lastStatus).toBe("opened");
  });
});

describe("verificação Svix", () => {
  const secret = `whsec_${Buffer.from("segredo-de-teste-123").toString("base64")}`;
  const now = new Date(Date.UTC(2026, 10, 20, 12));
  const ts = Math.floor(now.getTime() / 1000);
  const body = '{"type":"email.delivered"}';
  const headers = (sig: string, t = ts) => new Headers({ "svix-id": "msg_1", "svix-timestamp": String(t), "svix-signature": sig });
  it("aceita assinatura válida e recusa inválida, ausente, sem segredo ou fora da janela", () => {
    expect(verifySvix(secret, headers(signSvix(secret, "msg_1", ts, body)), body, now)).toBe(true);
    expect(verifySvix(secret, headers(`v1,${"A".repeat(44)}`), body, now)).toBe(false);
    expect(verifySvix(secret, new Headers(), body, now)).toBe(false);
    expect(verifySvix(undefined, headers(signSvix(secret, "msg_1", ts, body)), body, now)).toBe(false);
    expect(verifySvix(secret, headers(signSvix(secret, "msg_1", ts - 600, body), ts - 600), body, now)).toBe(false);
    expect(verifySvix(secret, headers(signSvix(secret, "msg_1", ts, body)), body + " ", now)).toBe(false);
  });
});
