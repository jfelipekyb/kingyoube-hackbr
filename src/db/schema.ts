// Modelo de dados completo de docs/02-ARQUITETURA.md. Dinheiro sempre em centavos (bigint).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const cents = (name: string) => bigint(name, { mode: "bigint" });
const centsZero = (name: string) => cents(name).notNull().default(sql`0`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["analista", "contador"]);
export const contactSource = pgEnum("contact_source", ["cadastro", "firecrawl", "simulado"]);
// Semáforos (docs/11): acordo do fornecedor sobre o RAD e recebimento das vendas.
export const radAgreement = pgEnum("rad_acordo", ["aceita", "recusa", "sem_resposta"]);
export const radAgreementSource = pgEnum("rad_acordo_fonte", ["cadastro", "resposta_cobranca", "simulado"]);
export const receiptStatus = pgEnum("recebimento", ["recebido", "a_receber", "vencido"]);
export const invoiceDirection = pgEnum("invoice_direction", ["venda", "compra"]);
export const invoiceSource = pgEnum("invoice_source", ["seed", "upload"]);
export const rfbService = pgEnum("rfb_service", ["debitos", "creditos", "pagamentos", "recolhimentos"]);
export const rfbRequestState = pgEnum("rfb_request_state", [
  "solicitada",
  "em_processamento",
  "concluida",
  "baixada",
  "normalizada",
  "erro",
  "expirada",
]);
export const receitaModeEnum = pgEnum("receita_mode", ["SIMULADO", "REAL"]);
export const paymentSourceService = pgEnum("payment_source_service", ["pagamentos", "recolhimentos"]);
export const reconciliationKind = pgEnum("reconciliation_kind", ["debito", "credito"]);
export const reconciliationStatus = pgEnum("reconciliation_status", [
  "conciliado",
  "divergente_valor",
  "so_na_nota",
  "aguardando_janela",
  "so_na_receita",
  "atencao",
]);
export const radOption = pgEnum("rad_option", ["PAGAMENTO_TOTAL", "PAGAMENTO_PARCIAL"]);
export const radProposalState = pgEnum("rad_proposal_state", [
  "rascunho",
  "aguardando_aprovacao",
  "aprovada",
  "darf_gerado",
  "pago_confirmado",
  "recusada",
  "erro_receita",
  "vencida",
]);
export const outboundMessageKind = pgEnum("outbound_email_kind", ["darf", "cobranca_fornecedor", "alerta_radar"]);
export const outboundChannel = pgEnum("outbound_channel", ["email", "whatsapp"]);
export const docChangeStatus = pgEnum("doc_change_status", ["sem_mudanca", "mudou", "alertado"]);
export const agentRunStatus = pgEnum("agent_run_status", ["rodando", "concluida", "erro"]);
export const agentKey = pgEnum("agent_key", [
  "kim",
  "captura",
  "apuracao",
  "conciliador",
  "conferente",
  "analista",
  "tesouraria",
  "vigia",
  "mensageiro",
]);
export const agentEventStatus = pgEnum("agent_event_status", [
  "trabalhando",
  "feito",
  "revisado_ok",
  "revisado_divergente",
  "aguardando_humano",
  "erro",
]);
export const reviewStatus = pgEnum("review_status", ["revisado_ok", "revisado_divergente"]);
export const kimInputMode = pgEnum("kim_input_mode", ["voz", "botao", "texto"]);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cnpj: varchar("cnpj", { length: 14 }).notNull().unique(),
  cnpjRoot: varchar("cnpj_root", { length: 8 }).notNull(),
  segment: text("segment").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull(),
});

export const counterparties = pgTable("counterparties", {
  id: uuid("id").primaryKey().defaultRandom(),
  cnpj: varchar("cnpj", { length: 14 }).notNull().unique(),
  name: text("name").notNull(),
  siteUrl: text("site_url"),
  financeEmail: text("finance_email"),
  contactSource: contactSource("contact_source").notNull().default("cadastro"),
  contactFoundAt: timestamp("contact_found_at", { withTimezone: true }),
  radAgreement: radAgreement("rad_acordo").notNull().default("sem_resposta"),
  radAgreementAt: timestamp("rad_acordo_em", { withTimezone: true }),
  radAgreementSource: radAgreementSource("rad_acordo_fonte"),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    accessKey: varchar("access_key", { length: 44 }).notNull(),
    direction: invoiceDirection("direction").notNull(),
    docModel: smallint("doc_model").notNull(),
    counterpartyCnpj: varchar("counterparty_cnpj", { length: 14 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    totalCents: cents("total_cents").notNull(),
    cbsCents: cents("cbs_cents").notNull(),
    source: invoiceSource("source").notNull(),
    // Só vendas (docs/11): situação do recebimento e vencimento do título.
    receipt: receiptStatus("recebimento"),
    titleDueDate: date("vencimento_titulo"),
  },
  (t) => [uniqueIndex("invoices_company_key_uq").on(t.companyId, t.accessKey)],
);

export const rfbRequests = pgTable(
  "rfb_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    service: rfbService("service").notNull(),
    ticket: text("ticket"),
    state: rfbRequestState("state").notNull().default("solicitada"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    etaSeconds: integer("eta_seconds"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    mode: receitaModeEnum("mode").notNull(),
    // Nonce do webhook guardado só como hash (docs/02, docs/03).
    webhookNonceHash: text("webhook_nonce_hash"),
  },
  (t) => [index("rfb_requests_company_service_idx").on(t.companyId, t.service, t.requestedAt)],
);

// Append-only: o bruto do arquivo da Receita.
export const rfbRawFiles = pgTable("rfb_raw_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => rfbRequests.id),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

const rfbDocColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  accessKey: varchar("access_key", { length: 100 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  origin: integer("origin").notNull(),
  docModel: integer("doc_model").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  apuradoCents: cents("apurado_cents").notNull(),
  excedenteCents: centsZero("excedente_cents"),
  suspensoCents: centsZero("suspenso_cents"),
});

export const rfbDebits = pgTable(
  "rfb_debits",
  {
    ...rfbDocColumns(),
    saldoDevedorCents: cents("saldo_devedor_cents").notNull(),
    inexigivelCents: centsZero("inexigivel_cents"),
    pgtoAntecipadoCents: centsZero("pgto_antecipado_cents"),
    extintoCents: centsZero("extinto_cents"),
  },
  (t) => [uniqueIndex("rfb_debits_natural_uq").on(t.companyId, t.accessKey, t.period, t.origin)],
);

export const rfbCredits = pgTable(
  "rfb_credits",
  {
    ...rfbDocColumns(),
    apropriadoCents: centsZero("apropriado_cents"),
    aApropriarCents: centsZero("a_apropriar_cents"),
    inapropriavelCents: centsZero("inapropriavel_cents"),
    prescritoCents: centsZero("prescrito_cents"),
    utilizadoCents: centsZero("utilizado_cents"),
    inutilizavelCents: centsZero("inutilizavel_cents"),
    restabelecidoCents: centsZero("restabelecido_cents"),
    saldoCredorCents: cents("saldo_credor_cents").notNull(),
    pedidoRessarcimentoCents: centsZero("pedido_ressarcimento_cents"),
  },
  (t) => [uniqueIndex("rfb_credits_natural_uq").on(t.companyId, t.accessKey, t.period, t.origin)],
);

export const rfbPayments = pgTable(
  "rfb_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    darfNumber: varchar("darf_number", { length: 17 }).notNull(),
    type: smallint("type").notNull(), // 1 RAD | 2 PCONT
    collectedOn: date("collected_on").notNull(),
    seq: integer("seq").notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    dueDate: date("due_date").notNull(),
    counterpartyCnpj: varchar("counterparty_cnpj", { length: 14 }),
    accessKey: varchar("access_key", { length: 100 }),
    principalCents: cents("principal_cents").notNull(),
    multaCents: cents("multa_cents").notNull(),
    jurosCents: cents("juros_cents").notNull(),
    totalCents: cents("total_cents").notNull(),
    sourceService: paymentSourceService("source_service").notNull(),
  },
  (t) => [uniqueIndex("rfb_payments_natural_uq").on(t.companyId, t.sourceService, t.darfNumber, t.seq)],
);

export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    accessKey: varchar("access_key", { length: 100 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    kind: reconciliationKind("kind").notNull(),
    status: reconciliationStatus("status").notNull(),
    invoiceCents: cents("invoice_cents"),
    rfbCents: cents("rfb_cents"),
    diffCents: cents("diff_cents"),
    ruleId: varchar("rule_id", { length: 8 }).notNull(),
    explanation: text("explanation"),
    // Texto do modelo fixo por regra; quando a LLM reescreve, `explanation` guarda a versão reescrita (docs/04).
    explanationOriginal: text("explanation_original"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    contractVersion: text("contract_version").notNull(),
    // Conferente (docs/04): só aponta; `revisado_divergente` pede olhar humano. Nunca corrige o item.
    reviewStatus: reviewStatus("review_status"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (t) => [uniqueIndex("reconciliation_items_natural_uq").on(t.companyId, t.accessKey, t.period, t.kind)],
);

export const radProposals = pgTable(
  "rad_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    accessKey: varchar("access_key", { length: 44 }).notNull(),
    option: radOption("option").notNull(),
    partialCents: cents("partial_cents"),
    justification: text("justification"),
    state: radProposalState("state").notNull().default("rascunho"),
    preparedBy: text("prepared_by").notNull(),
    submittedBy: text("submitted_by"),
    approvedBy: text("approved_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    darfPix: text("darf_pix"),
    darfBarcode: text("darf_barcode"),
    darfPdfUrl: text("darf_pdf_url"),
    dueDate: date("due_date"),
    principalCents: cents("principal_cents"),
    totalCents: cents("total_cents"),
    rfbReturnCode: text("rfb_return_code"),
    rfbMessage: text("rfb_message"),
    awareOfRefusal: boolean("aware_of_refusal").notNull().default(false),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    darfGeneratedAt: timestamp("darf_generated_at", { withTimezone: true }),
    // Marca "gerando": reservada antes de chamar a Receita, para dois cliques não gerarem dois DARFs.
    darfRequestedAt: timestamp("darf_requested_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    paidPrincipalCents: cents("paid_principal_cents"),
    divergenceRule: varchar("divergence_rule", { length: 3 }),
    createdAt: createdAt(),
  },
  // Uma proposta aberta por compra: preparar duas vezes devolve a mesma. pago_confirmado não conta (o saldo ainda travado vira nova proposta).
  (t) => [
    uniqueIndex("rad_proposals_open_invoice_uq")
      .on(t.companyId, t.invoiceId)
      .where(sql`${t.state} in ('rascunho', 'aguardando_aprovacao', 'aprovada', 'darf_gerado', 'erro_receita')`),
  ],
);

export const outboundMessages = pgTable("outbound_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: outboundChannel("channel").notNull().default("email"),
  kind: outboundMessageKind("kind").notNull(),
  refId: text("ref_id").notNull(),
  toLabel: text("to_label").notNull(),
  resendId: text("resend_id"),
  idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull().unique(),
  createdAt: createdAt(),
  lastStatus: text("last_status"),
  body: text("body"),
});

export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailId: text("email_id").notNull(),
  outboundMessageId: uuid("outbound_message_id").references(() => outboundMessages.id),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  rawHash: varchar("raw_hash", { length: 64 }).notNull(),
});

export const docWatch = pgTable("doc_watch", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  lastVersion: text("last_version"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  changeStatus: docChangeStatus("change_status"),
  diffText: text("diff_text"),
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
});

// Append-only: UPDATE e DELETE bloqueados por trigger (migration 0001).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    result: text("result").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_action_idx").on(t.action, t.at)],
);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  triggeredBy: text("triggered_by").notNull(),
  status: agentRunStatus("status").notNull().default("rodando"),
  // Contagem por tarefa de docs/06 (base das horas devolvidas) e estado de cada passo da rodada.
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  steps: jsonb("steps").$type<Record<string, RunStepState>>().notNull().default({}),
});

export interface RunStepState {
  status: "trabalhando" | "feito" | "revisado_ok" | "revisado_divergente" | "erro";
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Estado interno de passos de várias chamadas (ex.: páginas do Vigia já lidas). */
  cursor?: Record<string, unknown>;
}

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => agentRuns.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    agent: agentKey("agent").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    status: agentEventStatus("status").notNull(),
    summary: text("summary").notNull(),
    count: integer("count").notNull().default(0),
    minutesSaved: integer("minutes_saved").notNull().default(0),
  },
  (t) => [index("agent_events_run_idx").on(t.runId, t.at)],
);

export const effortStandards = pgTable("effort_standards", {
  task: text("task").primaryKey(),
  label: text("label").notNull(),
  minutes: integer("minutes").notNull(),
  source: text("source").notNull().default("premissa"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Premissas da projeção (docs/09): editáveis só pelo Contador, como as de `effort_standards`. */
export const teamPremises = pgTable("team_premises", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  value: integer("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kimQueries = pgTable("kim_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id").references(() => users.id),
  inputMode: kimInputMode("input_mode").notNull(),
  recognizedText: text("recognized_text"),
  intent: text("intent").notNull(),
  answerText: text("answer_text").notNull(),
});

/** Tempos de cada caractere da fala (ElevenLabs with-timestamps), em segundos. */
export interface CharAlignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

/** Áudio da fala da Kim (voz sintética; nunca a voz do usuário), pelo hash de texto + voz + modelo: a mesma frase não gasta crédito duas vezes. */
export const kimAudioCache = pgTable("kim_audio_cache", {
  hash: varchar("hash", { length: 64 }).primaryKey(),
  voiceId: text("voice_id").notNull(),
  model: text("model").notNull(),
  text: text("text").notNull(),
  mime: text("mime").notNull(),
  audioBase64: text("audio_base64").notNull(),
  alignment: jsonb("alignment").$type<CharAlignment | null>(),
  hits: integer("hits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
