// Propostas de RAD (docs/02, docs/04, docs/11): a Tesouraria prepara, uma pessoa envia, o contador decide.
// As travas ficam aqui, no servidor; a tela só reflete o que o serviço permite.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { counterparties, invoices, radProposals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { radCandidates } from "@/services/carteira/metrics";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";
import type { ReceitaAdapter } from "@/services/receita/types";
import { supplierLights, type RowLight } from "@/services/semaforos";
import { AWARE_OF_REFUSAL_TEXT, RAD_ERROR_MESSAGE, RAD_STATE_LABEL, type RadState } from "./labels";

export { AWARE_OF_REFUSAL_TEXT, RAD_ERROR_MESSAGE, RAD_STATE_LABEL, type RadState };

export type RadProposal = typeof radProposals.$inferSelect;
export type RadOption = RadProposal["option"];

/** Estados que ainda ocupam a compra: não se prepara outra proposta para ela. */
// Estados que ocupam a compra (índice único parcial rad_proposals_open_invoice_uq, migration 0005).
const OPEN_STATES: RadState[] = ["rascunho", "aguardando_aprovacao", "aprovada", "darf_gerado", "erro_receita"];

export class RadError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RadError";
  }
}

const TESOURARIA = "agente:tesouraria";
const DEFAULT_JUSTIFICATION = "Fornecedor não recolheu a CBS da nota; o RAD libera o crédito travado do cliente.";

async function humanUser(db: Db, actor: string) {
  const m = /^usuario:(.+)$/.exec(actor);
  if (!m) return null;
  const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, m[1]));
  return u ?? null;
}

async function requireHuman(db: Db, actor: string, action: string) {
  const user = await humanUser(db, actor);
  if (!user) throw new RadError(403, "SOMENTE_PESSOA", `Agente não pode ${action}: a decisão é de uma pessoa.`);
  return user;
}

async function requireContador(db: Db, actor: string, action: string) {
  const user = await requireHuman(db, actor, action);
  if (user.role !== "contador") throw new RadError(403, "SOMENTE_CONTADOR", `Só o contador pode ${action}.`);
  return user;
}

/** Busca a proposta; se a empresa informada não for a dona, recusa. */
export async function getProposal(db: Db, id: string, companyId: string | null): Promise<RadProposal> {
  const [p] = await db.select().from(radProposals).where(eq(radProposals.id, id));
  if (!p) throw new RadError(404, "NAO_ENCONTRADA", "Proposta não encontrada.");
  if (companyId && p.companyId !== companyId) throw new RadError(403, "OUTRA_EMPRESA", "Esta proposta é de outra empresa.");
  return p;
}

/** Semáforo do fornecedor da compra da proposta (docs/11). */
export async function proposalSupplier(db: Db, p: Pick<RadProposal, "companyId" | "invoiceId">) {
  const [inv] = await db
    .select({ cnpj: invoices.counterpartyCnpj, name: counterparties.name, radAgreement: counterparties.radAgreement })
    .from(invoices)
    .leftJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
    .where(eq(invoices.id, p.invoiceId));
  const row = (await supplierLights(db, p.companyId)).find((r) => r.cnpj === inv?.cnpj);
  return { cnpj: inv?.cnpj ?? "", name: inv?.name ?? null, radAgreement: inv?.radAgreement ?? null, light: (row?.light ?? "aguardando") as RowLight };
}

async function transition(db: Db, id: string, from: RadState[], set: Partial<typeof radProposals.$inferInsert>): Promise<RadProposal> {
  const [row] = await db
    .update(radProposals)
    .set(set)
    .where(and(eq(radProposals.id, id), inArray(radProposals.state, from)))
    .returning();
  if (!row) throw new RadError(409, "ESTADO_INVALIDO", "A proposta mudou de estado; recarregue a tela.");
  return row;
}

function expectState(p: RadProposal, allowed: RadState[], message: string) {
  if (!allowed.includes(p.state)) throw new RadError(409, "ESTADO_INVALIDO", `${message} (estado atual: ${RAD_STATE_LABEL[p.state]}).`);
}

/** A Tesouraria prepara o rascunho para uma candidata (docs/04). Idempotente por compra. */
async function openProposalOf(db: Db, companyId: string, invoiceId: string): Promise<RadProposal | undefined> {
  const [existing] = await db
    .select()
    .from(radProposals)
    .where(and(eq(radProposals.companyId, companyId), eq(radProposals.invoiceId, invoiceId), inArray(radProposals.state, OPEN_STATES)))
    .orderBy(desc(radProposals.createdAt));
  return existing;
}

export async function prepareProposal(db: Db, input: { companyId: string; invoiceId: string; requestedBy: string }): Promise<RadProposal> {
  const existing = await openProposalOf(db, input.companyId, input.invoiceId);
  if (existing) return existing;
  const candidate = (await radCandidates(db, input.companyId)).find((c) => c.invoiceId === input.invoiceId);
  if (!candidate) throw new RadError(409, "NAO_CANDIDATA", "Esta compra não é candidata a RAD (sem crédito travado).");
  const [row] = await db
    .insert(radProposals)
    .values({
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      accessKey: candidate.accessKey,
      option: "PAGAMENTO_TOTAL",
      justification: DEFAULT_JUSTIFICATION,
      preparedBy: TESOURARIA,
    })
    .onConflictDoNothing({ target: [radProposals.companyId, radProposals.invoiceId], where: sql`${radProposals.state} in (${sql.raw(OPEN_STATES.map((st) => `'${st}'`).join(", "))})` })
    .returning();
  if (!row) {
    const winner = await openProposalOf(db, input.companyId, input.invoiceId);
    if (!winner) throw new RadError(409, "ESTADO_INVALIDO", "A proposta mudou de estado; recarregue a tela.");
    return winner;
  }
  await recordAgentEvent(db, {
    agent: "tesouraria",
    action: "preparou_rad",
    entity: "rad_proposal",
    entityId: row.id,
    status: "feito",
    summary: "Preparou a proposta de RAD (rascunho) para o contador decidir",
    count: 1,
    minutesSaved: 15,
  });
  await recordAudit(db, { actor: input.requestedBy, action: "rad.preparar", entity: "rad_proposal", entityId: row.id, result: "ok", details: { invoiceId: input.invoiceId } });
  return row;
}

/** Ajuste do rascunho: total ou parcial, com justificativa. Depois de erro da Receita, volta a rascunho. */
export async function updateDraft(
  db: Db,
  input: { id: string; companyId: string | null; actor: string; option: RadOption; partialCents: bigint | null; justification: string },
): Promise<RadProposal> {
  await requireHuman(db, input.actor, "editar a proposta");
  const p = await getProposal(db, input.id, input.companyId);
  expectState(p, ["rascunho", "erro_receita"], "Só rascunho ou proposta com erro da Receita pode ser editada");
  const justification = input.justification.trim();
  if (!justification) throw new RadError(400, "JUSTIFICATIVA", "Escreva a justificativa da proposta.");
  if (input.option === "PAGAMENTO_PARCIAL" && (input.partialCents === null || input.partialCents <= 0n)) {
    throw new RadError(400, "VALOR_PARCIAL", "Informe o valor parcial (maior que zero).");
  }
  const row = await transition(db, p.id, ["rascunho", "erro_receita"], {
    option: input.option,
    partialCents: input.option === "PAGAMENTO_PARCIAL" ? input.partialCents : null,
    justification,
    state: "rascunho",
    rfbReturnCode: null,
    rfbMessage: null,
  });
  await recordAudit(db, { actor: input.actor, action: "rad.editar", entity: "rad_proposal", entityId: p.id, result: "ok", details: { option: input.option, de: p.state } });
  return row;
}

/** rascunho → aguardando_aprovacao. Só pessoa envia. */
export async function submitProposal(db: Db, input: { id: string; companyId: string | null; actor: string; now?: Date }): Promise<RadProposal> {
  await requireHuman(db, input.actor, "enviar a proposta");
  const p = await getProposal(db, input.id, input.companyId);
  expectState(p, ["rascunho"], "Só rascunho pode ser enviado");
  if (!p.justification?.trim()) throw new RadError(400, "JUSTIFICATIVA", "Escreva a justificativa antes de enviar.");
  const row = await transition(db, p.id, ["rascunho"], { state: "aguardando_aprovacao", submittedBy: input.actor, submittedAt: input.now ?? new Date() });
  await recordAudit(db, { actor: input.actor, action: "rad.enviar", entity: "rad_proposal", entityId: p.id, result: "ok" });
  return row;
}

async function decide(db: Db, input: { id: string; companyId: string | null; actor: string }, action: string) {
  await requireContador(db, input.actor, action);
  const p = await getProposal(db, input.id, input.companyId);
  expectState(p, ["aguardando_aprovacao"], "Só proposta aguardando aprovação pode ser decidida");
  if (p.submittedBy === input.actor || p.preparedBy === input.actor) {
    throw new RadError(403, "MESMA_PESSOA", "Quem preparou ou enviou a proposta não pode decidi-la.");
  }
  return p;
}

/** aguardando_aprovacao → aprovada. Fornecedor vermelho exige "Estou ciente da recusa do fornecedor" (409 sem ela). */
export async function approveProposal(
  db: Db,
  input: { id: string; companyId: string | null; actor: string; awareOfRefusal?: boolean; now?: Date },
): Promise<RadProposal> {
  let p: RadProposal;
  try {
    p = await decide(db, input, "aprovar a proposta");
  } catch (e) {
    if (e instanceof RadError) {
      await recordAudit(db, { actor: input.actor, action: "rad.aprovar", entity: "rad_proposal", entityId: input.id, result: "negado", details: { codigo: e.code } });
    }
    throw e;
  }
  const supplier = await proposalSupplier(db, p);
  if (supplier.light === "vermelho" && input.awareOfRefusal !== true) {
    await recordAudit(db, { actor: input.actor, action: "rad.aprovar", entity: "rad_proposal", entityId: p.id, result: "negado", details: { codigo: "CIENTE_OBRIGATORIO" } });
    throw new RadError(409, "CIENTE_OBRIGATORIO", `Fornecedor recusou o RAD. Para aprovar, marque "${AWARE_OF_REFUSAL_TEXT}".`);
  }
  const row = await transition(db, p.id, ["aguardando_aprovacao"], {
    state: "aprovada",
    approvedBy: input.actor,
    decidedAt: input.now ?? new Date(),
    awareOfRefusal: supplier.light === "vermelho",
  });
  await recordAudit(db, {
    actor: input.actor,
    action: "rad.aprovar",
    entity: "rad_proposal",
    entityId: p.id,
    result: "ok",
    details: { fornecedorVermelho: supplier.light === "vermelho", ciente: supplier.light === "vermelho" },
  });
  return row;
}

/** aguardando_aprovacao → recusada. */
export async function rejectProposal(db: Db, input: { id: string; companyId: string | null; actor: string; reason: string; now?: Date }): Promise<RadProposal> {
  const p = await decide(db, input, "recusar a proposta");
  const reason = input.reason.trim();
  if (!reason) throw new RadError(400, "MOTIVO", "Escreva o motivo da recusa.");
  const row = await transition(db, p.id, ["aguardando_aprovacao"], { state: "recusada", approvedBy: input.actor, decidedAt: input.now ?? new Date(), rejectionReason: reason });
  await recordAudit(db, { actor: input.actor, action: "rad.recusar", entity: "rad_proposal", entityId: p.id, result: "ok" });
  return row;
}

/** aprovada → darf_gerado (ou erro_receita). Só o contador, só proposta aprovada por outra pessoa que não quem enviou. */
export async function generateDarf(
  deps: { db: Db; adapter: ReceitaAdapter; now?: () => Date },
  input: { id: string; companyId: string | null; actor: string },
): Promise<RadProposal> {
  const { db } = deps;
  let p: RadProposal;
  try {
    await requireContador(db, input.actor, "gerar o DARF");
    p = await getProposal(db, input.id, input.companyId);
    expectState(p, ["aprovada"], "DARF só sai de proposta aprovada");
    if (!p.approvedBy || p.approvedBy === p.submittedBy) throw new RadError(403, "MESMA_PESSOA", "Quem enviou não pode ser quem aprovou.");
  } catch (e) {
    if (e instanceof RadError) {
      await recordAudit(db, { actor: input.actor, action: "rad.gerar_darf", entity: "rad_proposal", entityId: input.id, result: "negado", details: { codigo: e.code } });
    }
    throw e;
  }
  const result = await deps.adapter.gerarDarfRad(p.companyId, [
    { chaveDFE: p.accessKey, opcaoPagamento: p.option, ...(p.option === "PAGAMENTO_PARCIAL" && p.partialCents !== null ? { valorDarfParcialCents: p.partialCents } : {}) },
  ]);
  if (result.cdRetorno !== "DARF_GERADO") {
    const fields = "dadosInvalidos" in result && result.dadosInvalidos?.length ? ` Campos: ${result.dadosInvalidos.join(", ")}.` : "";
    const row = await transition(db, p.id, ["aprovada"], { state: "erro_receita", rfbReturnCode: result.cdRetorno, rfbMessage: RAD_ERROR_MESSAGE[result.cdRetorno] + fields });
    await recordAgentEvent(db, { agent: "tesouraria", action: "darf_erro", entity: "rad_proposal", entityId: p.id, status: "erro", summary: `A Receita recusou o DARF: ${result.cdRetorno}` });
    await recordAudit(db, { actor: input.actor, action: "rad.gerar_darf", entity: "rad_proposal", entityId: p.id, result: "erro", details: { cdRetorno: result.cdRetorno } });
    return row;
  }
  const row = await transition(db, p.id, ["aprovada"], {
    state: "darf_gerado",
    darfPix: result.darf.chavePIX,
    darfBarcode: result.darf.codigoBarras,
    darfPdfUrl: result.darf.linkDarfPDF,
    dueDate: result.informacoesPagamento.dataMaximaPagamento,
    principalCents: result.informacoesPagamento.valorDarfPrincipalCents,
    totalCents: result.informacoesPagamento.valorDarfTotalCents,
    rfbReturnCode: result.cdRetorno,
    rfbMessage: null,
    darfGeneratedAt: (deps.now ?? (() => new Date()))(),
  });
  await recordAgentEvent(db, {
    agent: "tesouraria",
    action: "darf_gerado",
    entity: "rad_proposal",
    entityId: p.id,
    status: "feito",
    summary: "DARF do RAD gerado pela Receita após aprovação do contador",
    count: 1,
    minutesSaved: 10,
  });
  await recordAudit(db, { actor: input.actor, action: "rad.gerar_darf", entity: "rad_proposal", entityId: p.id, result: "ok", details: { cdRetorno: result.cdRetorno, vencimento: row.dueDate } });
  return row;
}

export async function listProposals(db: Db, companyId: string | null = null) {
  return db
    .select({ proposal: radProposals, supplierName: counterparties.name, supplierCnpj: invoices.counterpartyCnpj, cbsCents: invoices.cbsCents })
    .from(radProposals)
    .innerJoin(invoices, eq(invoices.id, radProposals.invoiceId))
    .leftJoin(counterparties, eq(counterparties.cnpj, invoices.counterpartyCnpj))
    .where(companyId ? eq(radProposals.companyId, companyId) : undefined)
    .orderBy(desc(radProposals.createdAt));
}
