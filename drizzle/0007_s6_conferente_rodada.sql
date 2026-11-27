CREATE TYPE "public"."review_status" AS ENUM('revisado_ok', 'revisado_divergente');--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "counts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "steps" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD COLUMN "review_status" "review_status";--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD COLUMN "review_note" text;