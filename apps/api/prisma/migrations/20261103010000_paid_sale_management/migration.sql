ALTER TABLE "Ticket"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "voidedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_voided_quantity_valid"
  CHECK ("voidedQuantity" >= 0 AND "voidedQuantity" <= "quantity" - "usedQuantity");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_deleted_state_valid"
  CHECK ("deletedAt" IS NULL OR ("status" = 'CANCELED' AND "voidedQuantity" = "quantity" - "usedQuantity"));

DROP INDEX "Ticket_userId_matchId_key";
CREATE INDEX "Ticket_userId_matchId_idx" ON "Ticket"("userId", "matchId");
CREATE UNIQUE INDEX "Ticket_userId_matchId_active_key" ON "Ticket"("userId", "matchId") WHERE "deletedAt" IS NULL;
