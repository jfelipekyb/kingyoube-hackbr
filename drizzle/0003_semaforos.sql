CREATE TYPE "public"."rad_acordo" AS ENUM('aceita', 'recusa', 'sem_resposta');--> statement-breakpoint
CREATE TYPE "public"."rad_acordo_fonte" AS ENUM('cadastro', 'resposta_cobranca', 'simulado');--> statement-breakpoint
CREATE TYPE "public"."recebimento" AS ENUM('recebido', 'a_receber', 'vencido');--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "rad_acordo" "rad_acordo" DEFAULT 'sem_resposta' NOT NULL;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "rad_acordo_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "rad_acordo_fonte" "rad_acordo_fonte";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recebimento" "recebimento";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vencimento_titulo" date;