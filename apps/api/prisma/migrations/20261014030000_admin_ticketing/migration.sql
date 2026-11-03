-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketPaymentMethod" AS ENUM ('MANUAL', 'FREE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salesCloseAt" TIMESTAMP(3),
ADD COLUMN     "salesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "salesOpenAt" TIMESTAMP(3);

-- Existing catalog stays visible; new matches require explicit publication.
UPDATE "Match" SET "published" = true;

-- AlterTable
ALTER TABLE "Sector" ADD COLUMN     "salesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "entryToken" TEXT,
ADD COLUMN     "usedQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TicketPayment" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "method" "TicketPaymentMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAdmission" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_ticketId_key" ON "TicketPayment"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_reference_key" ON "TicketPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAdmission_ticketId_requestKey_key" ON "TicketAdmission"("ticketId", "requestKey");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_entryToken_key" ON "Ticket"("entryToken");

-- AddForeignKey
ALTER TABLE "TicketPayment" ADD CONSTRAINT "TicketPayment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPayment" ADD CONSTRAINT "TicketPayment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_used_quantity_valid" CHECK ("usedQuantity" BETWEEN 0 AND "quantity");
ALTER TABLE "TicketPayment" ADD CONSTRAINT "TicketPayment_amount_valid" CHECK ("amountCents" >= 0);
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 4);
ALTER TABLE "Match" ADD CONSTRAINT "Match_sales_window_valid" CHECK (
  ("salesOpenAt" IS NULL OR "salesCloseAt" IS NULL OR "salesOpenAt" < "salesCloseAt")
  AND ("salesOpenAt" IS NULL OR "salesOpenAt" < "startsAt")
  AND ("salesCloseAt" IS NULL OR "salesCloseAt" <= "startsAt")
);
