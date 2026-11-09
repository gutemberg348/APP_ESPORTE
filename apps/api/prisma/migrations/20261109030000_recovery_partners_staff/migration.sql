-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CASHIER';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "contact" VARCHAR(30) NOT NULL DEFAULT '',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "website" VARCHAR(500) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "emailAtIssue" VARCHAR(254) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDelivery" (
    "id" UUID NOT NULL,
    "resetId" UUID NOT NULL,
    "payload" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lockToken" UUID,
    "sentAt" TIMESTAMP(3),
    "errorCode" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerBenefit" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "conditions" VARCHAR(2000) NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailDelivery_resetId_key" ON "MailDelivery"("resetId");

-- CreateIndex
CREATE INDEX "MailDelivery_status_nextAttemptAt_idx" ON "MailDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PartnerBenefit_partnerId_active_idx" ON "PartnerBenefit"("partnerId", "active");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_resetId_fkey" FOREIGN KEY ("resetId") REFERENCES "PasswordResetToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerBenefit" ADD CONSTRAINT "PartnerBenefit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_status_check" CHECK ("status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_expiry_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "PartnerBenefit" ADD CONSTRAINT "PartnerBenefit_period_check" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt");
