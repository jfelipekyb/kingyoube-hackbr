// Mensageiro (docs/05, docs/09, docs/11): DARF por e-mail (Resend) e por WhatsApp (SIMULADO).
// Sem RESEND_API_KEY o e-mail é simulado; com a chave, o mesmo código envia de verdade.
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { companies, emailEvents, outboundMessages, radProposals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { maskAccessKey } from "@/lib/access-key";
import { isSimulado, SIMULATED_BADGE } from "@/lib/config";
import { formatDateBR } from "@/lib/dates";
import { maskEmail } from "@/lib/mask";
import { formatBRL } from "@/lib/money";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;
export type OutboundMessage = typeof outboundMessages.$inferSelect;

const RESEND_API = "https://api.resend.com";
export const SIMULATED_STATUS = "simulado";

export interface MensageiroDeps {
  db: Db;
  env?: Env;
  fetch?: Fetch;
}

export const emailIdempotencyKey = (proposalId: string) => `darf-${proposalId}`;
export const whatsappIdempotencyKey = (proposalId: string) => `whatsapp-darf-${proposalId}`;
export const whatsappMode = (env: Env = process.env) => (env.WHATSAPP_MODE?.trim().toUpperCase() || "SIMULADO") as "SIMULADO" | string;

async function darfContext(db: Db, proposalId: string) {
  const [row] = await db
    .select({ p: radProposals, companyName: companies.name })
    .from(radProposals)
    .innerJoin(companies, eq(companies.id, radProposals.companyId))
    .where(eq(radProposals.id, proposalId));
  if (!row) throw new Error("Proposta não encontrada");
  if (!row.p.darfPix || row.p.totalCents === null || !row.p.dueDate) throw new Error("A proposta ainda não tem DARF gerado");
  const approverId = /^usuario:(.+)$/.exec(row.p.approvedBy ?? "")?.[1];
  const [approver] = approverId ? await db.select({ name: users.name }).from(users).where(eq(users.id, approverId)) : [];
  return { ...row.p, companyName: row.companyName.replace(/\s*\(FICTÍCIA\)$/, ""), approverName: approver?.name ?? "contador" };
}

function darfText(c: Awaited<ReturnType<typeof darfContext>>, env: Env) {
  const appUrl = env.APP_URL;
  const pdf = c.darfPdfUrl ? (c.darfPdfUrl.startsWith("/") && appUrl ? `${appUrl.replace(/\/$/, "")}${c.darfPdfUrl}` : c.darfPdfUrl) : "—";
  const amount = `Valor total: ${formatBRL(c.totalCents!)} — vencimento ${formatDateBR(c.dueDate!)}.`;
  const pix = `Pix copia e cola: ${c.darfPix}`;
  const notPaid = "Este e-mail não confirma pagamento: o pagamento só é confirmado pela consulta de recolhimentos da Receita.";
  const simulated = isSimulado(env) ? [`${SIMULATED_BADGE}. Pix e código de barras fictícios: não pague.`] : [];
  return {
    subject: `${simulated.length ? "[SIMULADO] " : ""}DARF do RAD — ${c.companyName} — vence ${formatDateBR(c.dueDate!)}`,
    lines: [
      ...simulated,
      `DARF de recolhimento como adquirente (RAD) aprovado por ${c.approverName} para ${c.companyName}.`,
      `Nota: ${maskAccessKey(c.accessKey)}`,
      amount,
      pix,
      `Código de barras: ${c.darfBarcode}`,
      `PDF: ${pdf}`,
      notPaid,
    ],
    whatsapp: [...simulated, amount, pix, notPaid],
  };
}

const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** E-mail do DARF ao financeiro. Idempotente por `darf-<id>`: reenviar não duplica. */
export async function sendDarfEmail(deps: MensageiroDeps, proposalId: string, actor: string): Promise<OutboundMessage> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const key = emailIdempotencyKey(proposalId);
  const [existing] = await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, key));
  if (existing && existing.lastStatus !== "erro") return existing;
  const c = await darfContext(db, proposalId);
  const to = env.FINANCEIRO_EMAIL?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();
  const { subject, lines } = darfText(c, env);
  const toLabel = maskEmail(to) ?? "financeiro (FINANCEIRO_EMAIL não cadastrado)";
  let resendId: string | null = null;
  let status = SIMULATED_STATUS;
  if (apiKey) {
    const from = env.RESEND_FROM?.trim();
    if (!to || !from) throw new Error("Envio real exige FINANCEIRO_EMAIL e RESEND_FROM");
    const res = await (deps.fetch ?? fetch)(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ from, to: [to], subject, text: lines.join("\n"), html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    if (res.ok && body.id) {
      resendId = body.id;
      status = "enviado";
    } else {
      status = "erro";
    }
  }
  const values = { channel: "email" as const, kind: "darf" as const, refId: proposalId, toLabel, resendId, idempotencyKey: key, lastStatus: status, body: subject };
  const [row] = existing
    ? await db.update(outboundMessages).set(values).where(eq(outboundMessages.id, existing.id)).returning()
    : await db.insert(outboundMessages).values(values).onConflictDoUpdate({ target: outboundMessages.idempotencyKey, set: values }).returning();
  await recordAgentEvent(db, {
    agent: "mensageiro",
    action: "email_darf",
    entity: "outbound_message",
    entityId: row.id,
    status: status === "erro" ? "erro" : "feito",
    summary: status === SIMULATED_STATUS ? "E-mail do DARF registrado em modo simulado (sem RESEND_API_KEY)" : status === "erro" ? "A Resend recusou o e-mail do DARF" : "E-mail do DARF enviado pela Resend ao financeiro",
    count: status === "erro" ? 0 : 1,
    minutesSaved: status === "erro" ? 0 : 5,
  });
  await recordAudit(db, { actor, action: "mensagem.email_darf", entity: "rad_proposal", entityId: proposalId, result: status, details: { canal: "email", para: toLabel } });
  return row;
}

/** WhatsApp do DARF: em SIMULADO só registra a mensagem e a prévia (nenhum número real). */
export async function sendDarfWhatsapp(deps: MensageiroDeps, proposalId: string, actor: string): Promise<OutboundMessage> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const key = whatsappIdempotencyKey(proposalId);
  const [existing] = await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, key));
  if (existing) return existing;
  if (whatsappMode(env) !== "SIMULADO") throw new Error("WhatsApp real (WHATSAPP_MODE=NVOIP) entra na S9; use WHATSAPP_MODE=SIMULADO");
  const c = await darfContext(db, proposalId);
  const { whatsapp } = darfText(c, env);
  const body = [`Olá, financeiro da ${c.companyName}! Aqui é o Mensageiro da KingYouBe.`, ...whatsapp].join("\n");
  const [row] = await db
    .insert(outboundMessages)
    .values({ channel: "whatsapp", kind: "darf", refId: proposalId, toLabel: "Financeiro do cliente (WhatsApp simulado)", idempotencyKey: key, lastStatus: SIMULATED_STATUS, body })
    .onConflictDoNothing()
    .returning();
  if (!row) return (await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, key)))[0];
  await recordAgentEvent(db, {
    agent: "mensageiro",
    action: "whatsapp_darf",
    entity: "outbound_message",
    entityId: row.id,
    status: "feito",
    summary: "WhatsApp do DARF registrado em modo simulado",
    count: 1,
    minutesSaved: 3,
  });
  await recordAudit(db, { actor, action: "mensagem.whatsapp_darf", entity: "rad_proposal", entityId: proposalId, result: SIMULATED_STATUS, details: { canal: "whatsapp", modo: "SIMULADO" } });
  return row;
}

export async function sendDarfMessages(deps: MensageiroDeps, proposalId: string, actor: string) {
  const email = await sendDarfEmail(deps, proposalId, actor);
  const whatsapp = await sendDarfWhatsapp(deps, proposalId, actor);
  return { email, whatsapp };
}

export async function messagesFor(db: Db, proposalId: string) {
  return db.select().from(outboundMessages).where(and(eq(outboundMessages.kind, "darf"), eq(outboundMessages.refId, proposalId))).orderBy(desc(outboundMessages.createdAt));
}

/** Fallback do webhook (docs/09): consulta `GET /emails/{id}` e grava `last_event`. Em simulado, não faz nada. */
export async function refreshEmailStatus(deps: MensageiroDeps, message: OutboundMessage): Promise<OutboundMessage> {
  const apiKey = (deps.env ?? process.env).RESEND_API_KEY?.trim();
  if (!apiKey || !message.resendId) return message;
  const res = await (deps.fetch ?? fetch)(`${RESEND_API}/emails/${encodeURIComponent(message.resendId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return message;
  const body = (await res.json().catch(() => ({}))) as { last_event?: string };
  if (!body.last_event || body.last_event === message.lastStatus) return message;
  const [row] = await deps.db.update(outboundMessages).set({ lastStatus: body.last_event }).where(eq(outboundMessages.id, message.id)).returning();
  return row;
}

/** Evento do webhook já verificado: grava em email_events e atualiza o status. Não guarda o corpo, só o hash. */
export async function recordEmailEvent(db: Db, rawBody: string) {
  const event = JSON.parse(rawBody) as { type?: unknown; data?: { email_id?: unknown } };
  const type = typeof event.type === "string" ? event.type : "desconhecido";
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  const [msg] = emailId ? await db.select().from(outboundMessages).where(eq(outboundMessages.resendId, emailId)) : [];
  await db.insert(emailEvents).values({ emailId, outboundMessageId: msg?.id ?? null, type, rawHash: createHash("sha256").update(rawBody).digest("hex") });
  if (msg) await db.update(outboundMessages).set({ lastStatus: type.replace(/^email\./, "") }).where(eq(outboundMessages.id, msg.id));
  await recordAudit(db, { actor: "sistema:resend", action: "resend.webhook", entity: "outbound_message", entityId: msg?.id ?? null, result: type });
  return { type, matched: Boolean(msg) };
}

/** E-mail genérico do Mensageiro/Vigia: Resend com Idempotency-Key, ou simulado sem RESEND_API_KEY. Reenviar a mesma chave não duplica. */
export async function sendEmailOnce(
  deps: MensageiroDeps,
  input: { kind: OutboundMessage["kind"]; refId: string; key: string; to: string | undefined; fallbackLabel: string; subject: string; lines: string[] },
): Promise<{ row: OutboundMessage; created: boolean }> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const [existing] = await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, input.key));
  if (existing && existing.lastStatus !== "erro") return { row: existing, created: false };
  const to = input.to?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();
  const toLabel = maskEmail(to) ?? input.fallbackLabel;
  let resendId: string | null = null;
  let status = SIMULATED_STATUS;
  if (apiKey) {
    const from = env.RESEND_FROM?.trim();
    if (!to || !from) throw new Error("Envio real exige o destinatário e RESEND_FROM");
    const res = await (deps.fetch ?? fetch)(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.key },
      body: JSON.stringify({ from, to: [to], subject: input.subject, text: input.lines.join("\n"), html: input.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    if (res.ok && body.id) {
      resendId = body.id;
      status = "enviado";
    } else {
      status = "erro";
    }
  }
  const values = { channel: "email" as const, kind: input.kind, refId: input.refId, toLabel, resendId, idempotencyKey: input.key, lastStatus: status, body: input.subject };
  const [row] = existing
    ? await db.update(outboundMessages).set(values).where(eq(outboundMessages.id, existing.id)).returning()
    : await db.insert(outboundMessages).values(values).onConflictDoUpdate({ target: outboundMessages.idempotencyKey, set: values }).returning();
  return { row, created: true };
}
