-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "financialPolicy" JSONB;

-- CreateTable
CREATE TABLE "FinancialSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "companyName" VARCHAR(100) NOT NULL DEFAULT 'Empresa operadora',
    "companyBps" INTEGER NOT NULL DEFAULT 1000,
    "commissionBase" VARCHAR(10) NOT NULL DEFAULT 'NET',
    "gatewayBps" INTEGER NOT NULL DEFAULT 0,
    "gatewayFixedCents" INTEGER NOT NULL DEFAULT 0,
    "payoutWeekday" INTEGER NOT NULL DEFAULT 5,
    "clubRecipient" VARCHAR(200) NOT NULL DEFAULT '',
    "clubPixKey" VARCHAR(200) NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketFinancial" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "policy" JSONB NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "gatewayFeeCents" INTEGER NOT NULL,
    "feeSource" VARCHAR(20) NOT NULL,
    "companyCents" INTEGER NOT NULL,
    "clubCents" INTEGER NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketFinancial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketFinancialEntry" (
    "id" UUID NOT NULL,
    "financialId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "grossDeltaCents" INTEGER NOT NULL,
    "refundedDeltaCents" INTEGER NOT NULL,
    "gatewayDeltaCents" INTEGER NOT NULL,
    "companyDeltaCents" INTEGER NOT NULL,
    "clubDeltaCents" INTEGER NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketFinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPayout" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "requestKey" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceBeforeCents" BIGINT NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "recipient" VARCHAR(200) NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketFinancial_paymentId_key" ON "TicketFinancial"("paymentId");

-- CreateIndex
CREATE INDEX "TicketFinancial_blocked_feeSource_idx" ON "TicketFinancial"("blocked", "feeSource");

-- CreateIndex
CREATE INDEX "TicketFinancialEntry_createdAt_idx" ON "TicketFinancialEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketFinancialEntry_financialId_revision_key" ON "TicketFinancialEntry"("financialId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPayout_requestKey_key" ON "ClubPayout"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPayout_reference_key" ON "ClubPayout"("reference");

-- CreateIndex
CREATE INDEX "ClubPayout_createdAt_idx" ON "ClubPayout"("createdAt");

-- AddForeignKey
ALTER TABLE "TicketFinancial" ADD CONSTRAINT "TicketFinancial_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TicketPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketFinancialEntry" ADD CONSTRAINT "TicketFinancialEntry_financialId_fkey" FOREIGN KEY ("financialId") REFERENCES "TicketFinancial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayout" ADD CONSTRAINT "ClubPayout_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial amounts are cents; percentages are basis points. Never erase paid history.
ALTER TABLE "FinancialSettings" ADD CONSTRAINT "FinancialSettings_values_valid" CHECK ("companyBps" BETWEEN 0 AND 10000 AND "gatewayBps" BETWEEN 0 AND 10000 AND "gatewayFixedCents" BETWEEN 0 AND 100000000 AND "commissionBase" IN ('NET','GROSS') AND "payoutWeekday" BETWEEN 0 AND 6 AND "version" >= 0);
ALTER TABLE "TicketFinancial" ADD CONSTRAINT "TicketFinancial_balance_valid" CHECK ("grossCents" > 0 AND "refundedCents" BETWEEN 0 AND "grossCents" AND "gatewayFeeCents" >= 0 AND "companyCents" >= 0 AND "version" >= 0 AND "feeSource" IN ('PROVIDER','MANUAL','ESTIMATED') AND "grossCents"::bigint - "refundedCents"::bigint = "gatewayFeeCents"::bigint + "companyCents"::bigint + "clubCents"::bigint);
ALTER TABLE "TicketFinancialEntry" ADD CONSTRAINT "TicketFinancialEntry_balance_valid" CHECK ("revision" >= 0 AND "grossDeltaCents"::bigint - "refundedDeltaCents"::bigint = "gatewayDeltaCents"::bigint + "companyDeltaCents"::bigint + "clubDeltaCents"::bigint);
ALTER TABLE "ClubPayout" ADD CONSTRAINT "ClubPayout_amount_valid" CHECK ("amountCents" > 0 AND "balanceBeforeCents" >= "amountCents" AND (("voidedAt" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL)));
