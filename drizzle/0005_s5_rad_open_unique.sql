-- Proposta aberta duplicada (corrida da S4): mantém a mais avançada (ou a de menor id) e recusa os rascunhos extras antes do índice.
WITH closed AS (
UPDATE "rad_proposals" SET "state" = 'recusada', "rejection_reason" = 'Duplicada: outra proposta aberta já cobre esta nota (migration 0005).'
WHERE "state" in ('rascunho', 'erro_receita')
  AND EXISTS (
    SELECT 1 FROM "rad_proposals" o
    WHERE o."company_id" = "rad_proposals"."company_id" AND o."invoice_id" = "rad_proposals"."invoice_id"
      AND o."state" in ('rascunho', 'aguardando_aprovacao', 'aprovada', 'darf_gerado', 'erro_receita')
      AND (o."state" not in ('rascunho', 'erro_receita') OR o."id" < "rad_proposals"."id")
  )
  RETURNING "id", "invoice_id"
)
INSERT INTO "audit_log" ("actor", "action", "entity", "entity_id", "result", "details")
SELECT 'sistema:migration', 'rad.recusar', 'rad_proposal', closed."id"::text, 'recusada', jsonb_build_object('motivo', 'duplicada', 'migration', '0005', 'invoiceId', closed."invoice_id")
FROM closed;--> statement-breakpoint
CREATE UNIQUE INDEX "rad_proposals_open_invoice_uq" ON "rad_proposals" USING btree ("company_id","invoice_id") WHERE "rad_proposals"."state" in ('rascunho', 'aguardando_aprovacao', 'aprovada', 'darf_gerado', 'erro_receita');