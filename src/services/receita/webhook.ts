// Webhook da Receita (docs/03): sem autenticação do lado dela; a segurança é nossa.
// URL única por solicitação com nonce (só o hash fica na base), só tíquete conhecido e em aberto,
// IP esperado no modo REAL. Nunca registra corpo, nonce nem URL. O aviso é só um sinal: o dado vem do download.
import { eq } from "drizzle-orm";
import { rfbRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordAudit } from "@/services/auditoria";
import { recordAgentEvent } from "@/services/equipe";
import { OPEN_STATES, processRequest, type ApuracaoDeps, type RequestRow } from "./sync";
import { SERVICE_LABEL } from "./types";
import { nonceMatches } from "./webhook-nonce";

export const RECEITA_WEBHOOK_IP = "189.9.61.23";
export const WEBHOOK_MAX_BYTES = 16 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function audit(db: Db, requestId: string | null, result: string, details: Record<string, unknown> = {}) {
  await recordAudit(db, { actor: "sistema:receita-webhook", action: "receita.webhook", entity: "rfb_request", entityId: requestId, result, details });
}

export async function findWebhookTarget(db: Db, requestId: string, nonce: string): Promise<RequestRow | null> {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await db.select().from(rfbRequests).where(eq(rfbRequests.id, requestId));
  if (!row || !nonceMatches(nonce, row.webhookNonceHash)) return null;
  return row;
}

/** HEAD feito pela Receita na abertura (docs/03 §1.3). */
export async function handleWebhookHead(db: Db, requestId: string, nonce: string): Promise<number> {
  const row = await findWebhookTarget(db, requestId, nonce);
  await audit(db, row ? requestId : null, row ? "head_ok" : "nonce_invalido", { metodo: "HEAD" });
  return row ? 200 : 404;
}

export interface WebhookInput {
  requestId: string;
  nonce: string;
  body: string;
  sourceIp: string | null;
}

export async function handleWebhookPost(deps: ApuracaoDeps, input: WebhookInput): Promise<{ status: number; body: Record<string, unknown> }> {
  const { db } = deps;
  const row = await findWebhookTarget(db, input.requestId, input.nonce);
  if (!row) {
    await audit(db, null, "nonce_invalido", { metodo: "POST" });
    return { status: 404, body: { erro: "não encontrado" } };
  }
  if (deps.adapter.mode === "REAL" && input.sourceIp !== RECEITA_WEBHOOK_IP) {
    await audit(db, row.id, "ip_inesperado", { metodo: "POST" });
    return { status: 403, body: { erro: "origem não permitida" } };
  }
  if (Buffer.byteLength(input.body, "utf8") > WEBHOOK_MAX_BYTES) {
    await audit(db, row.id, "corpo_grande_demais", { metodo: "POST" });
    return { status: 413, body: { erro: "corpo grande demais" } };
  }
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("não é objeto");
    payload = parsed as Record<string, unknown>;
  } catch {
    await audit(db, row.id, "corpo_invalido", { metodo: "POST" });
    return { status: 400, body: { erro: "corpo inválido" } };
  }

  const open = (OPEN_STATES as readonly string[]).includes(row.state);
  const isError = typeof payload.codigoErro === "string" && payload.tiqueteSolicitacao === undefined;
  const ticketOk = typeof payload.tiqueteSolicitacao === "string" && payload.tiqueteSolicitacao === row.ticket;
  if (!open || (!isError && !ticketOk)) {
    await audit(db, row.id, "tiquete_desconhecido", { metodo: "POST", emAberto: open });
    return { status: 400, body: { erro: "tíquete desconhecido ou já encerrado" } };
  }

  await audit(db, row.id, isError ? "aviso_erro" : "aviso_ok", { metodo: "POST", servico: row.service });
  await recordAgentEvent(db, {
    runId: deps.runId ?? null,
    agent: "apuracao",
    action: "aviso_receita",
    entity: "rfb_request",
    entityId: row.id,
    status: "trabalhando",
    summary: `A Receita avisou sobre ${SERVICE_LABEL[row.service]}. Vou conferir a situação antes de baixar.`,
  });
  const state = await processRequest(deps, row.id);
  return { status: 200, body: { ok: true, situacao: state } };
}
