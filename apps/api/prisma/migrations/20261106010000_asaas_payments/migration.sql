ALTER TYPE "TicketPaymentMethod" ADD VALUE 'ASAAS';
ALTER TABLE "TicketPayment" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketPayment" ADD CONSTRAINT "TicketPayment_refund_valid" CHECK ("refundedCents" BETWEEN 0 AND "amountCents");

CREATE TABLE "BillingCustomer" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "environment" VARCHAR(20) NOT NULL,
  "documentEncrypted" TEXT NOT NULL, "documentLast4" VARCHAR(4) NOT NULL,
  "providerReference" TEXT, "creationStartedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3), "lockToken" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingCustomer_environment_valid" CHECK ("environment" IN ('sandbox', 'production'))
);
CREATE UNIQUE INDEX "BillingCustomer_userId_environment_key" ON "BillingCustomer"("userId", "environment");

CREATE TABLE "GatewayIntent" (
  "id" UUID NOT NULL, "environment" VARCHAR(20) NOT NULL,
  "ticketId" UUID, "chargeId" UUID, "customerId" UUID NOT NULL,
  "generation" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
  "amountCents" INTEGER NOT NULL, "netCents" INTEGER, "refundedCents" INTEGER NOT NULL DEFAULT 0,
  "state" VARCHAR(24) NOT NULL DEFAULT 'QUEUED', "providerReference" TEXT,
  "pixPayload" TEXT, "pixImage" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
  "creationStartedAt" TIMESTAMP(3), "cancelRequestedAt" TIMESTAMP(3),
  "refundRequestedAt" TIMESTAMP(3), "refundStartedAt" TIMESTAMP(3), "failureCode" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0, "wakeVersion" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3), "lockToken" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GatewayIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GatewayIntent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GatewayIntent_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PaymentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GatewayIntent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GatewayIntent_target_valid" CHECK (("ticketId" IS NOT NULL) <> ("chargeId" IS NOT NULL)),
  CONSTRAINT "GatewayIntent_amount_valid" CHECK ("amountCents" BETWEEN 1 AND 100000000 AND "refundedCents" BETWEEN 0 AND "amountCents" AND ("netCents" IS NULL OR "netCents" BETWEEN 0 AND "amountCents")),
  CONSTRAINT "GatewayIntent_environment_valid" CHECK ("environment" IN ('sandbox', 'production')),
  CONSTRAINT "GatewayIntent_state_valid" CHECK ("state" IN ('QUEUED','CREATING','PENDING','PROCESSING','RECEIVED','REFUNDING','REFUNDED','CANCELED','REVIEW','PARTIAL_REFUND'))
);
CREATE UNIQUE INDEX "GatewayIntent_generation_key" ON "GatewayIntent"("generation");
CREATE UNIQUE INDEX "GatewayIntent_chargeId_key" ON "GatewayIntent"("chargeId");
CREATE UNIQUE INDEX "GatewayIntent_environment_providerReference_key" ON "GatewayIntent"("environment", "providerReference");
CREATE INDEX "GatewayIntent_environment_nextAttemptAt_idx" ON "GatewayIntent"("environment", "nextAttemptAt");
CREATE INDEX "GatewayIntent_ticketId_createdAt_idx" ON "GatewayIntent"("ticketId", "createdAt");

CREATE TABLE "GatewayWebhook" (
  "id" UUID NOT NULL, "environment" VARCHAR(20) NOT NULL,
  "externalId" VARCHAR(200) NOT NULL, "event" VARCHAR(100) NOT NULL,
  "paymentId" VARCHAR(100), "externalReference" VARCHAR(200), "fingerprint" VARCHAR(64) NOT NULL,
  "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GatewayWebhook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GatewayWebhook_environment_valid" CHECK ("environment" IN ('sandbox', 'production'))
);
CREATE UNIQUE INDEX "GatewayWebhook_environment_externalId_key" ON "GatewayWebhook"("environment", "externalId");
CREATE INDEX "GatewayWebhook_environment_processedAt_createdAt_idx" ON "GatewayWebhook"("environment", "processedAt", "createdAt");
