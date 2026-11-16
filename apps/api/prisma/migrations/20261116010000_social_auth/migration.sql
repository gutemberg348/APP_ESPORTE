CREATE TABLE "SocialIdentity" (
  "id" UUID NOT NULL, "provider" VARCHAR(16) NOT NULL, "subject" VARCHAR(255) NOT NULL,
  "userId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialIdentity_provider_subject_key" ON "SocialIdentity"("provider", "subject");
CREATE INDEX "SocialIdentity_userId_idx" ON "SocialIdentity"("userId");
CREATE TABLE "SocialAuthAttempt" (
  "id" UUID NOT NULL, "provider" VARCHAR(16) NOT NULL, "stateHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL, "providerVerifier" TEXT NOT NULL, "challenge" TEXT NOT NULL,
  "ticketHash" TEXT, "profile" JSONB, "claimedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAuthAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialAuthAttempt_stateHash_key" ON "SocialAuthAttempt"("stateHash");
CREATE UNIQUE INDEX "SocialAuthAttempt_ticketHash_key" ON "SocialAuthAttempt"("ticketHash");
CREATE INDEX "SocialAuthAttempt_expiresAt_idx" ON "SocialAuthAttempt"("expiresAt");
