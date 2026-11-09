-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "asaasProductionWalletId" VARCHAR(36),
ADD COLUMN     "asaasSandboxWalletId" VARCHAR(36);

-- AlterTable
ALTER TABLE "PaymentCharge" ADD COLUMN     "paymentPolicy" JSONB;

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "ticketReservationMinutes" INTEGER NOT NULL DEFAULT 15,
    "shopReservationMinutes" INTEGER NOT NULL DEFAULT 30,
    "shopQuoteMinutes" INTEGER NOT NULL DEFAULT 10,
    "cashChargeMinutes" INTEGER NOT NULL DEFAULT 15,
    "shopPendingOrderLimit" INTEGER NOT NULL DEFAULT 3,
    "checkInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkInPoints" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);


-- Business values have safety bounds in addition to API validation.
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_values_valid" CHECK (
  "id" = 'main' AND "ticketReservationMinutes" BETWEEN 1 AND 1440
  AND "shopReservationMinutes" BETWEEN 1 AND 1440 AND "shopQuoteMinutes" BETWEEN 1 AND 60
  AND "cashChargeMinutes" BETWEEN 1 AND 1440 AND "shopPendingOrderLimit" BETWEEN 1 AND 20
  AND "checkInPoints" BETWEEN 1 AND 100000 AND "version" >= 0
);
INSERT INTO "BusinessSettings" ("id", "updatedAt") VALUES ('main', CURRENT_TIMESTAMP);
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_receiving_wallets_valid" CHECK (
  ("asaasSandboxWalletId" IS NULL OR "asaasSandboxWalletId" = '' OR "asaasSandboxWalletId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
  AND ("asaasProductionWalletId" IS NULL OR "asaasProductionWalletId" = '' OR "asaasProductionWalletId" ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
);
