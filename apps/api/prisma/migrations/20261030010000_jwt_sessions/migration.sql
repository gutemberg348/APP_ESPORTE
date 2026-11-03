ALTER TABLE "Session" ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
-- Previous opaque sessions are intentionally retired during JWT migration.
-- Account passwords and all business data are preserved; users log in again.
UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "RefreshToken" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "sessionId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
