ALTER TABLE "Match" ADD COLUMN "entryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gateOpenAt" TIMESTAMP(3),
  ADD COLUMN "gateCloseAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "entryVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketAdmission" ADD COLUMN "scanId" UUID,
  ADD COLUMN "qrVersion" INTEGER;
CREATE UNIQUE INDEX "TicketAdmission_scanId_key" ON "TicketAdmission"("scanId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_entryVersion_valid" CHECK ("entryVersion" >= 0);
ALTER TABLE "Match" ADD CONSTRAINT "Match_gate_window_valid" CHECK (
  "gateOpenAt" IS NULL OR "gateCloseAt" IS NULL OR "gateOpenAt" < "gateCloseAt"
);
-- Static QR secrets are intentionally retired. Payment and admission history
-- stays intact; owners request a signed short-lived QR when the gate opens.
UPDATE "Ticket" SET "entryToken" = NULL;
