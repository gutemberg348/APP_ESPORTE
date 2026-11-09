-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'SENT', 'CANCELED', 'VOIDED');

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "requestKey" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "recipient" VARCHAR(200) NOT NULL,
    "pixKey" VARCHAR(200) NOT NULL DEFAULT '',
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "payoutId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttachment" (
    "id" UUID NOT NULL,
    "withdrawalId" UUID,
    "payoutId" UUID,
    "actorId" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removalReason" VARCHAR(500),

    CONSTRAINT "PayoutAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_requestKey_key" ON "WithdrawalRequest"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_payoutId_key" ON "WithdrawalRequest"("payoutId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutAttachment_withdrawalId_createdAt_idx" ON "PayoutAttachment"("withdrawalId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutAttachment_payoutId_createdAt_idx" ON "PayoutAttachment"("payoutId", "createdAt");

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ClubPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ClubPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 100000000);
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_state_check" CHECK (("status" IN ('SENT', 'VOIDED') AND "payoutId" IS NOT NULL) OR ("status" IN ('PENDING', 'CANCELED') AND "payoutId" IS NULL));
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_parent_check" CHECK (num_nonnulls("withdrawalId", "payoutId") = 1);
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_size_check" CHECK ("byteLength" > 0 AND "byteLength" <= 5242880 AND octet_length("content") = "byteLength");
ALTER TABLE "PayoutAttachment" ADD CONSTRAINT "PayoutAttachment_mime_check" CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'));
CREATE UNIQUE INDEX "PayoutAttachment_active_withdrawal_hash" ON "PayoutAttachment" ("withdrawalId", "sha256") WHERE "removedAt" IS NULL;
CREATE UNIQUE INDEX "PayoutAttachment_active_payout_hash" ON "PayoutAttachment" ("payoutId", "sha256") WHERE "removedAt" IS NULL;
