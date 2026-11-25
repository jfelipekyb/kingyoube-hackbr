CREATE TYPE "public"."agent_event_status" AS ENUM('trabalhando', 'feito', 'revisado_ok', 'revisado_divergente', 'aguardando_humano', 'erro');--> statement-breakpoint
CREATE TYPE "public"."agent_key" AS ENUM('kim', 'captura', 'apuracao', 'conciliador', 'conferente', 'analista', 'tesouraria', 'vigia', 'mensageiro');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('rodando', 'concluida', 'erro');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('cadastro', 'firecrawl', 'simulado');--> statement-breakpoint
CREATE TYPE "public"."doc_change_status" AS ENUM('sem_mudanca', 'mudou', 'alertado');--> statement-breakpoint
CREATE TYPE "public"."invoice_direction" AS ENUM('venda', 'compra');--> statement-breakpoint
CREATE TYPE "public"."invoice_source" AS ENUM('seed', 'upload');--> statement-breakpoint
CREATE TYPE "public"."kim_input_mode" AS ENUM('voz', 'botao', 'texto');--> statement-breakpoint
CREATE TYPE "public"."outbound_email_kind" AS ENUM('darf', 'cobranca_fornecedor', 'alerta_radar');--> statement-breakpoint
CREATE TYPE "public"."payment_source_service" AS ENUM('pagamentos', 'recolhimentos');--> statement-breakpoint
CREATE TYPE "public"."rad_option" AS ENUM('PAGAMENTO_TOTAL', 'PAGAMENTO_PARCIAL');--> statement-breakpoint
CREATE TYPE "public"."rad_proposal_state" AS ENUM('rascunho', 'aguardando_aprovacao', 'aprovada', 'darf_gerado', 'pago_confirmado', 'recusada', 'erro_receita', 'vencida');--> statement-breakpoint
CREATE TYPE "public"."receita_mode" AS ENUM('SIMULADO', 'REAL');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_kind" AS ENUM('debito', 'credito');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('conciliado', 'divergente_valor', 'so_na_nota', 'aguardando_janela', 'so_na_receita', 'atencao');--> statement-breakpoint
CREATE TYPE "public"."rfb_request_state" AS ENUM('solicitada', 'em_processamento', 'concluida', 'baixada', 'normalizada', 'erro', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."rfb_service" AS ENUM('debitos', 'creditos', 'pagamentos', 'recolhimentos');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('analista', 'contador');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent" "agent_key" NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"status" "agent_event_status" NOT NULL,
	"summary" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"minutes_saved" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"triggered_by" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'rodando' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"result" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"cnpj_root" varchar(8) NOT NULL,
	"segment" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "companies_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"name" text NOT NULL,
	"site_url" text,
	"finance_email" text,
	"contact_source" "contact_source" DEFAULT 'cadastro' NOT NULL,
	"contact_found_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "counterparties_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "doc_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"last_version" text,
	"last_checked_at" timestamp with time zone,
	"change_status" "doc_change_status",
	"diff_text" text,
	"alerted_at" timestamp with time zone,
	CONSTRAINT "doc_watch_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "effort_standards" (
	"task" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"source" text DEFAULT 'premissa' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" text NOT NULL,
	"outbound_email_id" uuid,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_hash" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"access_key" varchar(44) NOT NULL,
	"direction" "invoice_direction" NOT NULL,
	"doc_model" smallint NOT NULL,
	"counterparty_cnpj" varchar(14) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"period" varchar(7) NOT NULL,
	"total_cents" bigint NOT NULL,
	"cbs_cents" bigint NOT NULL,
	"source" "invoice_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kim_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"input_mode" "kim_input_mode" NOT NULL,
	"recognized_text" text,
	"intent" text NOT NULL,
	"answer_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "outbound_email_kind" NOT NULL,
	"ref_id" text NOT NULL,
	"to_label" text NOT NULL,
	"resend_id" text,
	"idempotency_key" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" text,
	CONSTRAINT "outbound_emails_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "rad_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"access_key" varchar(44) NOT NULL,
	"option" "rad_option" NOT NULL,
	"partial_cents" bigint,
	"justification" text,
	"state" "rad_proposal_state" DEFAULT 'rascunho' NOT NULL,
	"prepared_by" text NOT NULL,
	"submitted_by" text,
	"approved_by" text,
	"decided_at" timestamp with time zone,
	"darf_pix" text,
	"darf_barcode" text,
	"darf_pdf_url" text,
	"due_date" date,
	"principal_cents" bigint,
	"total_cents" bigint,
	"rfb_return_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid,
	"access_key" varchar(100) NOT NULL,
	"period" varchar(7) NOT NULL,
	"kind" "reconciliation_kind" NOT NULL,
	"status" "reconciliation_status" NOT NULL,
	"invoice_cents" bigint,
	"rfb_cents" bigint,
	"diff_cents" bigint,
	"rule_id" varchar(8) NOT NULL,
	"explanation" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contract_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfb_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"access_key" varchar(100) NOT NULL,
	"period" varchar(7) NOT NULL,
	"origin" integer NOT NULL,
	"doc_model" integer NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"apurado_cents" bigint NOT NULL,
	"excedente_cents" bigint DEFAULT 0 NOT NULL,
	"suspenso_cents" bigint DEFAULT 0 NOT NULL,
	"apropriado_cents" bigint DEFAULT 0 NOT NULL,
	"a_apropriar_cents" bigint DEFAULT 0 NOT NULL,
	"inapropriavel_cents" bigint DEFAULT 0 NOT NULL,
	"prescrito_cents" bigint DEFAULT 0 NOT NULL,
	"utilizado_cents" bigint DEFAULT 0 NOT NULL,
	"inutilizavel_cents" bigint DEFAULT 0 NOT NULL,
	"restabelecido_cents" bigint DEFAULT 0 NOT NULL,
	"saldo_credor_cents" bigint NOT NULL,
	"pedido_ressarcimento_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfb_debits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"access_key" varchar(100) NOT NULL,
	"period" varchar(7) NOT NULL,
	"origin" integer NOT NULL,
	"doc_model" integer NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"apurado_cents" bigint NOT NULL,
	"excedente_cents" bigint DEFAULT 0 NOT NULL,
	"suspenso_cents" bigint DEFAULT 0 NOT NULL,
	"saldo_devedor_cents" bigint NOT NULL,
	"inexigivel_cents" bigint DEFAULT 0 NOT NULL,
	"pgto_antecipado_cents" bigint DEFAULT 0 NOT NULL,
	"extinto_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfb_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"darf_number" varchar(17) NOT NULL,
	"type" smallint NOT NULL,
	"collected_on" date NOT NULL,
	"seq" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"due_date" date NOT NULL,
	"counterparty_cnpj" varchar(14),
	"access_key" varchar(100),
	"principal_cents" bigint NOT NULL,
	"multa_cents" bigint NOT NULL,
	"juros_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"source_service" "payment_source_service" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfb_raw_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfb_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service" "rfb_service" NOT NULL,
	"ticket" text,
	"state" "rfb_request_state" DEFAULT 'solicitada' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eta_seconds" integer,
	"ready_at" timestamp with time zone,
	"downloaded_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"mode" "receita_mode" NOT NULL,
	"webhook_nonce_hash" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_outbound_email_id_outbound_emails_id_fk" FOREIGN KEY ("outbound_email_id") REFERENCES "public"."outbound_emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kim_queries" ADD CONSTRAINT "kim_queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD CONSTRAINT "rad_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD CONSTRAINT "rad_proposals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfb_credits" ADD CONSTRAINT "rfb_credits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfb_debits" ADD CONSTRAINT "rfb_debits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfb_payments" ADD CONSTRAINT "rfb_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfb_raw_files" ADD CONSTRAINT "rfb_raw_files_request_id_rfb_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rfb_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfb_requests" ADD CONSTRAINT "rfb_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_run_idx" ON "agent_events" USING btree ("run_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_key_uq" ON "invoices" USING btree ("company_id","access_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_items_natural_uq" ON "reconciliation_items" USING btree ("company_id","access_key","period","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "rfb_credits_natural_uq" ON "rfb_credits" USING btree ("company_id","access_key","period","origin");--> statement-breakpoint
CREATE UNIQUE INDEX "rfb_debits_natural_uq" ON "rfb_debits" USING btree ("company_id","access_key","period","origin");--> statement-breakpoint
CREATE UNIQUE INDEX "rfb_payments_natural_uq" ON "rfb_payments" USING btree ("company_id","source_service","darf_number","seq");--> statement-breakpoint
CREATE INDEX "rfb_requests_company_service_idx" ON "rfb_requests" USING btree ("company_id","service","requested_at");