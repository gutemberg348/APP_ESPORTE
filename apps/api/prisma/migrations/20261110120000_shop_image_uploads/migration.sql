CREATE TABLE "ShopImage" (
  "id" UUID NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "mimeType" VARCHAR(32) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShopImage_values_valid" CHECK (
    "mimeType" = 'image/webp' AND "byteLength" BETWEEN 1 AND 5242880
    AND octet_length("content") = "byteLength"
    AND "width" BETWEEN 1 AND 2000 AND "height" BETWEEN 1 AND 2000
    AND "sha256" ~ '^[a-f0-9]{64}$'
  )
);
CREATE UNIQUE INDEX "ShopImage_sha256_key" ON "ShopImage"("sha256");
