ALTER TABLE "Plan" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "description" VARCHAR(1000) NOT NULL DEFAULT '', ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_duration_positive" CHECK ("durationDays" BETWEEN 1 AND 3660);
CREATE TABLE "MembershipOrder" (
 "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "planId" UUID NOT NULL REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "planName" TEXT NOT NULL, "priceCents" INTEGER NOT NULL CHECK ("priceCents" > 0), "durationDays" INTEGER NOT NULL CHECK ("durationDays" > 0),
 "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING', "requestKey" VARCHAR(100) NOT NULL, "beforeSignature" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "appliedAt" TIMESTAMP(3), "validUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MembershipOrder_userId_requestKey_key" ON "MembershipOrder"("userId", "requestKey");
CREATE INDEX "MembershipOrder_userId_createdAt_idx" ON "MembershipOrder"("userId", "createdAt");
ALTER TABLE "Membership" ADD COLUMN "lastOrderId" UUID REFERENCES "MembershipOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Membership_lastOrderId_key" ON "Membership"("lastOrderId");
ALTER TABLE "GatewayIntent" ADD COLUMN "membershipOrderId" UUID REFERENCES "MembershipOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "GatewayIntent_membershipOrderId_key" ON "GatewayIntent"("membershipOrderId");

ALTER TABLE "GatewayIntent" DROP CONSTRAINT "GatewayIntent_target_valid";
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_target_valid" CHECK (num_nonnulls("ticketId", "chargeId", "shopOrderId", "membershipOrderId") = 1);

ALTER TABLE "BusinessSettings" ADD COLUMN "membershipPaymentMinutes" INTEGER NOT NULL DEFAULT 15 CHECK ("membershipPaymentMinutes" BETWEEN 1 AND 1440);
