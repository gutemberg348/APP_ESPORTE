ALTER TABLE "User" ADD COLUMN "referralCode" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "User" ADD COLUMN "referredById" UUID;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
