// Contato do fornecedor (Vigia, Firecrawl) e cobrança (Mensageiro, Resend + WhatsApp simulado). docs/05, docs/02, docs/11.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { counterparties, invoices, outboundMessages, radProposals } from "@/db/schema";
import type { Db } from "@/db/types";
import { maskAccessKey } from "@/lib/access-key";
import type { Env } from "@/lib/config";
import { maskEmail } from "@/lib/mask";
import { formatBRL } from "@/lib/money";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";
import { sendEmailOnce, SIMULATED_STATUS, type OutboundMessage } from "@/services/notificacao";
import { guardedScrape, type Scraper } from "@/services/vigia/scrape";
import { chargeState, type SupplierContactInfo } from "./labels";

export { CHARGE_STATE_LABEL, chargeState, type ChargeState, type SupplierContactInfo } from "./labels";

export class SupplierError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const CONTACT_FORMATS = [
  {
    type: "json",
    prompt: "Extraia CNPJ, razão social e e-mail do financeiro",
    schema: { type: "object", properties: { cnpj: { type: "string" }, razaoSocial: { type: "string" }, emailFinanceiro: { type: "string" } }, required: ["cnpj"] },
  },
];

interface ExtractedContact {
  cnpj?: string;
  razaoSocial?: string;
  emailFinanceiro?: string;
}

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");

/** APP_URL público = http(s) e não localhost. Sem isso, o Vigia usa a fixture (docs/05). */
export function hasPublicAppUrl(env: Env = process.env): boolean {
  const raw = env.APP_URL?.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) && !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}

async function readFixture(slug: string): Promise<ExtractedContact | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "fixtures", "firecrawl", `${slug}.json`), "utf8");
    return (JSON.parse(raw) as { json?: ExtractedContact }).json ?? null;
  } catch {
    return null;
  }
}

export type ContactResult =
  | { status: "contato_encontrado"; source: "firecrawl" | "simulado"; emailLabel: string }
  | { status: "cnpj_divergente" | "sem_site" | "sem_email" };

export interface SupplierDeps {
  db: Db;
  scraper?: Scraper | null;
  env?: Env;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Lê o site do fornecedor (lista fechada), confere o CNPJ extraído com o da nota e só então grava o e-mail financeiro. */
export async function findSupplierContact(deps: SupplierDeps, counterpartyId: string, actor: string): Promise<ContactResult> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, counterpartyId));
  if (!cp) throw new SupplierError(404, "FORNECEDOR_NAO_ENCONTRADO", "Fornecedor não encontrado.");
  const sitePath = cp.siteUrl ? cp.siteUrl.replace(/^https?:\/\/[^/]+/, "") : null;
  const slug = sitePath?.match(/^\/demo\/fornecedores\/([a-z0-9-]+)$/)?.[1] ?? null;
  const audit = (result: string, details: Record<string, unknown> = {}) =>
    recordAudit(db, { actor, action: "fornecedor.contato", entity: "counterparty", entityId: cp.id, result, details });
  if (!cp.siteUrl) {
    await audit("sem_site");
    return { status: "sem_site" };
  }
  let extracted: ExtractedContact | null;
  let source: "firecrawl" | "simulado";
  if (hasPublicAppUrl(env)) {
    if (!deps.scraper) throw new SupplierError(503, "SEM_FIRECRAWL", "FIRECRAWL_API_KEY não configurada: o Vigia não consegue ler o site.");
    const res = await guardedScrape(deps.scraper, cp.siteUrl, { formats: CONTACT_FORMATS }, env);
    extracted = (res.json ?? null) as ExtractedContact | null;
    source = "firecrawl";
  } else {
    if (!slug) throw new SupplierError(409, "FORA_DA_LISTA", "Site fora da lista fechada do Vigia.");
    extracted = await readFixture(slug);
    source = "simulado";
  }
  if (!extracted || digits(extracted.cnpj) !== cp.cnpj) {
    await audit("cnpj_divergente", { fonte: source });
    await recordAgentEvent(db, { agent: "vigia", action: "contato_cnpj_divergente", entity: "counterparty", entityId: cp.id, status: "erro", summary: "O CNPJ do site não bate com o da nota: contato não gravado" });
    return { status: "cnpj_divergente" };
  }
  const email = extracted.emailFinanceiro?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await audit("sem_email", { fonte: source });
    return { status: "sem_email" };
  }
  const at = (deps.now ?? (() => new Date()))();
  await db.update(counterparties).set({ financeEmail: email, contactSource: source, contactFoundAt: at }).where(eq(counterparties.id, cp.id));
  const emailLabel = maskEmail(email)!;
  await recordAgentEvent(db, {
    agent: "vigia",
    action: "contato_encontrado",
    entity: "counterparty",
    entityId: cp.id,
    status: "feito",
    summary: source === "simulado" ? "Achei o e-mail financeiro do fornecedor (fixture do site, sem APP_URL público) e conferi o CNPJ" : "Achei o e-mail financeiro no site do fornecedor e conferi o CNPJ",
    count: 1,
    minutesSaved: 10,
  });
  await audit("ok", { fonte: source, email: emailLabel });
  return { status: "contato_encontrado", source, emailLabel };
}

export const chargeIdempotencyKey = (invoiceId: string) => `cobranca-${invoiceId}`;
export const chargeWhatsappKey = (invoiceId: string) => `whatsapp-cobranca-${invoiceId}`;

/** Número da nota a partir da chave de acesso (posições 26 a 34, nNF). */
export function invoiceNumber(accessKey: string): string {
  return new Intl.NumberFormat("pt-BR").format(BigInt(accessKey.slice(25, 34)));
}

export function chargeText(input: { supplier: string; accessKey: string; cbsCents: bigint }) {
  const n = invoiceNumber(input.accessKey);
  const subject = `Recolhimento de CBS pendente — nota ${n}`;
  const lines = [
    `Olá, equipe financeira da ${input.supplier}.`,
    `Na apuração da Receita, a CBS da nota ${n} (chave ${maskAccessKey(input.accessKey)}), no valor de ${formatBRL(input.cbsCents)}, ainda não aparece como recolhida.`,
    "Pedimos, por gentileza, que confiram e façam o recolhimento. Se preferirem que o nosso cliente recolha como adquirente (RAD), é só avisar.",
    'Respostas possíveis: "Vou recolher" ou "Não aceito o RAD".',
    "Obrigado. Equipe CBS — escritório contábil (mensagem de demonstração).",
  ];
  return { subject, lines, whatsapp: `Olá! A CBS da nota ${n} (${formatBRL(input.cbsCents)}) ainda não consta como recolhida na Receita. Pode conferir? Responda "Vou recolher" ou "Não aceito o RAD".` };
}

/** Cobrança da nota pelo Mensageiro: e-mail para FORNECEDOR_EMAIL (caixa do time na demo) com Idempotency-Key cobranca-<invoiceId>, e WhatsApp simulado. */
export async function notifySupplier(deps: SupplierDeps, invoiceId: string, actor: string): Promise<{ email: OutboundMessage; whatsapp: OutboundMessage }> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.direction !== "compra") throw new SupplierError(404, "NOTA_NAO_ENCONTRADA", "Compra não encontrada.");
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.cnpj, inv.counterpartyCnpj));
  if (!cp?.financeEmail) throw new SupplierError(409, "SEM_CONTATO", "Ainda sem contato financeiro do fornecedor: busque o contato antes de cobrar.");
  // RAD já confirmado pela Receita para esta nota sai da cobrança: só o saldo ainda em aberto.
  const [{ paid }] = await db
    .select({ paid: sql<string>`coalesce(sum(${radProposals.paidPrincipalCents}), 0)::text` })
    .from(radProposals)
    .where(and(eq(radProposals.invoiceId, invoiceId), eq(radProposals.state, "pago_confirmado")));
  const openCents = inv.cbsCents - BigInt(paid);
  if (openCents <= 0n) throw new SupplierError(409, "JA_RECOLHIDO", "A CBS desta nota já foi recolhida via RAD confirmado: nada a cobrar.");
  const text = chargeText({ supplier: cp.name, accessKey: inv.accessKey, cbsCents: openCents });
  const { row: email, created } = await sendEmailOnce(deps, {
    kind: "cobranca_fornecedor",
    refId: invoiceId,
    key: chargeIdempotencyKey(invoiceId),
    to: env.FORNECEDOR_EMAIL,
    fallbackLabel: "caixa do time (FORNECEDOR_EMAIL não cadastrado)",
    subject: text.subject,
    lines: text.lines,
  });
  if (created) {
    await recordAgentEvent(db, {
      agent: "mensageiro",
      action: "cobranca_email",
      entity: "outbound_message",
      entityId: email.id,
      status: email.lastStatus === "erro" ? "erro" : "feito",
      summary: email.lastStatus === SIMULATED_STATUS ? "Cobrança ao fornecedor registrada em modo simulado (sem RESEND_API_KEY)" : email.lastStatus === "erro" ? "A Resend recusou a cobrança" : "Cobrança enviada ao fornecedor pela Resend",
      count: email.lastStatus === "erro" ? 0 : 1,
      minutesSaved: email.lastStatus === "erro" ? 0 : 10,
    });
    await recordAudit(db, { actor, action: "mensagem.cobranca", entity: "invoice", entityId: invoiceId, result: email.lastStatus ?? SIMULATED_STATUS, details: { canal: "email", para: email.toLabel } });
  }
  const wKey = chargeWhatsappKey(invoiceId);
  let [whatsapp] = await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, wKey));
  if (!whatsapp) {
    [whatsapp] = await db
      .insert(outboundMessages)
      .values({ channel: "whatsapp", kind: "cobranca_fornecedor", refId: invoiceId, toLabel: "WhatsApp do fornecedor (simulado)", idempotencyKey: wKey, lastStatus: SIMULATED_STATUS, body: text.whatsapp })
      .onConflictDoNothing({ target: outboundMessages.idempotencyKey })
      .returning();
    if (whatsapp) {
      await recordAgentEvent(db, { agent: "mensageiro", action: "cobranca_whatsapp", entity: "outbound_message", entityId: whatsapp.id, status: "feito", summary: "Cobrança pelo WhatsApp simulado (nenhum número real)", count: 1, minutesSaved: 2 });
      await recordAudit(db, { actor, action: "mensagem.cobranca", entity: "invoice", entityId: invoiceId, result: SIMULATED_STATUS, details: { canal: "whatsapp" } });
    } else {
      [whatsapp] = await db.select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, wKey));
    }
  }
  return { email, whatsapp };
}

export type SupplierResponse = "vou_recolher" | "nao_aceito";
export const SUPPLIER_RESPONSE_LABEL: Record<SupplierResponse, string> = { vou_recolher: "Vou recolher", nao_aceito: "Não aceito o RAD" };

/** Resposta do fornecedor à cobrança (simulada na demo): atualiza rad_acordo e, com ele, o semáforo (docs/11). */
export async function recordSupplierResponse(deps: SupplierDeps, input: { counterpartyId: string; response: SupplierResponse; actor: string }) {
  const { db } = deps;
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, input.counterpartyId));
  if (!cp) throw new SupplierError(404, "FORNECEDOR_NAO_ENCONTRADO", "Fornecedor não encontrado.");
  const charged = await chargesForSupplier(db, cp.cnpj);
  if (!charged.some((m) => m.channel === "email")) throw new SupplierError(409, "SEM_COBRANCA", "O fornecedor só responde depois da cobrança.");
  const agreement = input.response === "vou_recolher" ? "aceita" : "recusa";
  const at = (deps.now ?? (() => new Date()))();
  const [row] = await db.update(counterparties).set({ radAgreement: agreement, radAgreementAt: at, radAgreementSource: "simulado" }).where(eq(counterparties.id, cp.id)).returning();
  await recordAgentEvent(db, {
    agent: "mensageiro",
    action: "resposta_fornecedor",
    entity: "counterparty",
    entityId: cp.id,
    status: "feito",
    summary: `Fornecedor respondeu à cobrança (simulado): "${SUPPLIER_RESPONSE_LABEL[input.response]}"`,
    count: 1,
  });
  await recordAudit(db, { actor: input.actor, action: "fornecedor.resposta", entity: "counterparty", entityId: cp.id, result: agreement, details: { resposta: SUPPLIER_RESPONSE_LABEL[input.response], de: cp.radAgreement, fonte: "simulado" } });
  return row;
}

/** Mensagens de cobrança das compras deste fornecedor (mais recentes primeiro). */
export async function chargesForSupplier(db: Db, cnpj: string) {
  const inv = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.counterpartyCnpj, cnpj), eq(invoices.direction, "compra")));
  if (inv.length === 0) return [];
  return db
    .select()
    .from(outboundMessages)
    .where(and(eq(outboundMessages.kind, "cobranca_fornecedor"), inArray(outboundMessages.refId, inv.map((i) => i.id))))
    .orderBy(desc(outboundMessages.createdAt));
}

/** Contato, fonte e cobrança por fornecedor, para as compras do cliente aberto na tela. A nota cobrada é a de maior CBS. */
export async function supplierContactInfo(db: Db, companyId: string): Promise<Map<string, SupplierContactInfo>> {
  const rows = await db
    .select({ cp: counterparties, invoiceId: invoices.id, accessKey: invoices.accessKey, cbsCents: invoices.cbsCents })
    .from(counterparties)
    .innerJoin(invoices, and(eq(invoices.counterpartyCnpj, counterparties.cnpj), eq(invoices.companyId, companyId), eq(invoices.direction, "compra")))
    .orderBy(desc(invoices.cbsCents));
  const msgs = rows.length
    ? await db.select().from(outboundMessages).where(and(eq(outboundMessages.kind, "cobranca_fornecedor"), inArray(outboundMessages.refId, rows.map((r) => r.invoiceId)))).orderBy(desc(outboundMessages.createdAt))
    : [];
  const out = new Map<string, SupplierContactInfo>();
  for (const r of rows) {
    const prev = out.get(r.cp.id);
    const email = msgs.find((m) => m.refId === r.invoiceId && m.channel === "email") ?? null;
    if (prev && (prev.email || !email)) continue;
    out.set(r.cp.id, {
      siteUrl: r.cp.siteUrl,
      contactSource: r.cp.contactSource,
      contactFoundAt: r.cp.contactFoundAt,
      chargeInvoiceId: r.invoiceId,
      chargeInvoiceNumber: invoiceNumber(r.accessKey),
      email,
      whatsapp: msgs.find((m) => m.refId === r.invoiceId && m.channel === "whatsapp") ?? null,
      state: chargeState(r.cp.financeEmail, email?.lastStatus),
    });
  }
  return out;
}
