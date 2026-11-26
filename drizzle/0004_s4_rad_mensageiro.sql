CREATE TYPE "public"."outbound_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
ALTER TABLE "outbound_emails" RENAME TO "outbound_messages";--> statement-breakpoint
ALTER TABLE "email_events" RENAME COLUMN "outbound_email_id" TO "outbound_message_id";--> statement-breakpoint
ALTER TABLE "outbound_messages" DROP CONSTRAINT "outbound_emails_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "email_events" DROP CONSTRAINT "email_events_outbound_email_id_outbound_emails_id_fk";
--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD COLUMN "channel" "outbound_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "rfb_message" text;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "aware_of_refusal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "darf_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "paid_principal_cents" bigint;--> statement-breakpoint
ALTER TABLE "rad_proposals" ADD COLUMN "divergence_rule" varchar(3);--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_outbound_message_id_outbound_messages_id_fk" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."outbound_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_idempotency_key_unique" UNIQUE("idempotency_key");