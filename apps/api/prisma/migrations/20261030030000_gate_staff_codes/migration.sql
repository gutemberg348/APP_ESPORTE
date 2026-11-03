ALTER TYPE "UserRole" ADD VALUE 'GATE';
CREATE TABLE "GateAssignment" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "sectorId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GateAssignment_userId_sectorId_key" ON "GateAssignment"("userId", "sectorId");
CREATE INDEX "GateAssignment_userId_active_idx" ON "GateAssignment"("userId", "active");
ALTER TABLE "GateAssignment" ADD CONSTRAINT "GateAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateAssignment" ADD CONSTRAINT "GateAssignment_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketAccessCode" (
  "id" UUID NOT NULL, "ticketId" UUID NOT NULL, "codeHash" TEXT NOT NULL,
  "scanId" UUID NOT NULL, "entryVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAccessCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketAccessCode_version_valid" CHECK ("entryVersion" >= 0)
);
CREATE UNIQUE INDEX "TicketAccessCode_codeHash_key" ON "TicketAccessCode"("codeHash");
CREATE UNIQUE INDEX "TicketAccessCode_scanId_key" ON "TicketAccessCode"("scanId");
CREATE INDEX "TicketAccessCode_expiresAt_idx" ON "TicketAccessCode"("expiresAt");
ALTER TABLE "TicketAccessCode" ADD CONSTRAINT "TicketAccessCode_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
