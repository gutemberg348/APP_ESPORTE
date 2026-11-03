-- Profile and privacy preferences. Existing members remain outside the public ranking.
ALTER TABLE "User"
  ADD COLUMN "city" VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN "contact" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{"family":true,"personalize":true,"notifications":false,"ranking":false}',
  ADD COLUMN "schoolInterested" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "User_points_nonnegative" CHECK ("points" >= 0);

ALTER TABLE "Sector" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 500,
  ADD CONSTRAINT "Sector_capacity_nonnegative" CHECK ("capacity" >= 0),
  ADD CONSTRAINT "Sector_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "Ticket" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD CONSTRAINT "Ticket_quantity_range" CHECK ("quantity" BETWEEN 1 AND 4),
  ADD CONSTRAINT "Ticket_price_nonnegative" CHECK ("priceCents" >= 0);
-- Old pending requests get a finite expiry; paid/used tickets are unaffected.
UPDATE "Ticket" SET "expiresAt" = "createdAt" + INTERVAL '15 minutes' WHERE "status" = 'PENDING';
CREATE INDEX "Ticket_sectorId_status_expiresAt_idx" ON "Ticket"("sectorId", "status", "expiresAt");

ALTER TABLE "Partner" ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'gift',
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "conditions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Referral" ADD COLUMN "category" VARCHAR(60) NOT NULL DEFAULT 'Outro',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_price_nonnegative" CHECK ("priceCents" >= 0),
  ADD CONSTRAINT "Plan_discount_range" CHECK ("discountPercent" BETWEEN 0 AND 100);

CREATE TABLE "PointEntry" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PointEntry_userId_sourceKey_key" ON "PointEntry"("userId", "sourceKey");
CREATE INDEX "PointEntry_userId_createdAt_idx" ON "PointEntry"("userId", "createdAt");
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Reward" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cost" INTEGER NOT NULL,
  "stock" INTEGER NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'gift',
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Reward_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reward_cost_positive" CHECK ("cost" > 0),
  CONSTRAINT "Reward_stock_nonnegative" CHECK ("stock" >= 0)
);
CREATE UNIQUE INDEX "Reward_slug_key" ON "Reward"("slug");
CREATE TABLE "Redemption" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "rewardId" UUID NOT NULL,
  "cost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Redemption_cost_positive" CHECK ("cost" > 0)
);
CREATE UNIQUE INDEX "Redemption_userId_rewardId_key" ON "Redemption"("userId", "rewardId");
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
