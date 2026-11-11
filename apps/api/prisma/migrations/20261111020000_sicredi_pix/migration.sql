ALTER TYPE "TicketPaymentMethod" ADD VALUE 'SICREDI';
ALTER TABLE "GatewayIntent" ADD COLUMN "provider" VARCHAR(16) NOT NULL DEFAULT 'asaas',
 ADD COLUMN "pixEndToEndId" VARCHAR(32), ADD COLUMN "refundId" VARCHAR(35), ADD COLUMN "refundAmountCents" INTEGER;
ALTER TABLE "GatewayIntent" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_provider_valid" CHECK ("provider" IN ('asaas','sicredi'));
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_sicredi_reference_valid" CHECK ("provider" <> 'sicredi' OR ("providerReference" IS NOT NULL AND "providerReference" ~ '^[A-Za-z0-9]{26,35}$' AND "chargeId" IS NULL));
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_refund_amount_valid" CHECK ("refundAmountCents" IS NULL OR ("refundAmountCents" > 0 AND "refundAmountCents" <= "amountCents"));
CREATE UNIQUE INDEX "GatewayIntent_environment_pixEndToEndId_key" ON "GatewayIntent"("environment", "pixEndToEndId");
CREATE INDEX "GatewayIntent_provider_environment_nextAttemptAt_idx" ON "GatewayIntent"("provider", "environment", "nextAttemptAt");
ALTER TABLE "GatewayWebhook" ADD COLUMN "provider" VARCHAR(16) NOT NULL DEFAULT 'asaas';
ALTER TABLE "GatewayWebhook" ADD CONSTRAINT "GatewayWebhook_provider_valid" CHECK ("provider" IN ('asaas','sicredi'));
