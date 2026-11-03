-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('CASHIER_QR', 'CUSTOMER_QR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CashEntryKind" AS ENUM ('CASHBACK', 'REVERSAL');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicCode" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "partnerId" UUID,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantOffer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "cashbackBps" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customerQrEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MerchantOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantOperator" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MerchantOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashWallet" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "customerCode" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCharge" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "walletId" UUID,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "requestKey" VARCHAR(80) NOT NULL,
    "claimCode" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "merchantCents" INTEGER NOT NULL,
    "cashbackCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "gatewayFeeCents" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "pixPayload" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "kind" "CashEntryKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_publicCode_key" ON "Merchant"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_partnerId_key" ON "Merchant"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantOffer_tenantId_merchantId_key" ON "MerchantOffer"("tenantId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantOperator_userId_merchantId_key" ON "MerchantOperator"("userId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "CashWallet_customerCode_key" ON "CashWallet"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "CashWallet_tenantId_userId_key" ON "CashWallet"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCharge_claimCode_key" ON "PaymentCharge"("claimCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCharge_providerReference_key" ON "PaymentCharge"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentCharge_offerId_createdAt_idx" ON "PaymentCharge"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentCharge_walletId_createdAt_idx" ON "PaymentCharge"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCharge_creatorId_requestKey_key" ON "PaymentCharge"("creatorId", "requestKey");

-- CreateIndex
CREATE INDEX "CashEntry_walletId_createdAt_idx" ON "CashEntry"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_chargeId_kind_key" ON "CashEntry"("chargeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_externalId_key" ON "PaymentEvent"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOffer" ADD CONSTRAINT "MerchantOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOffer" ADD CONSTRAINT "MerchantOffer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOperator" ADD CONSTRAINT "MerchantOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantOperator" ADD CONSTRAINT "MerchantOperator_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashWallet" ADD CONSTRAINT "CashWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashWallet" ADD CONSTRAINT "CashWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MerchantOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CashWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CashWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money is stored in integer centavos, never floating point. Preserve all cents.
ALTER TABLE "MerchantOffer" ADD CONSTRAINT "MerchantOffer_rates_valid" CHECK (
  "cashbackBps" BETWEEN 0 AND 10000 AND "commissionBps" BETWEEN 0 AND 10000
  AND "cashbackBps" + "commissionBps" <= 10000
);
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_split_valid" CHECK (
  "grossCents" BETWEEN 1 AND 100000000 AND "merchantCents" >= 0 AND "cashbackCents" >= 0
  AND "commissionCents" >= 0 AND "gatewayFeeCents" >= 0
  AND "grossCents" = "merchantCents" + "cashbackCents" + "commissionCents" + "gatewayFeeCents"
);
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_direction_valid" CHECK (
  ("kind" = 'CASHBACK' AND "amountCents" > 0) OR ("kind" = 'REVERSAL' AND "amountCents" < 0)
);
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_type_valid" CHECK ("type" IN ('SETTLED', 'REFUNDED'));
