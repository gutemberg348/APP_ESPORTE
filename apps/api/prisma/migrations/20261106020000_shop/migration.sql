-- AlterTable
ALTER TABLE "GatewayIntent" ADD COLUMN     "shopOrderId" UUID;

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "mode" VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "externalUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "name" VARCHAR(100) NOT NULL DEFAULT 'Loja oficial',
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupAddress" VARCHAR(500) NOT NULL DEFAULT '',
    "shippingProvider" VARCHAR(20) NOT NULL DEFAULT 'RULES',
    "originPostalCode" VARCHAR(8) NOT NULL DEFAULT '',
    "paymentInstructions" VARCHAR(1000) NOT NULL DEFAULT '',
    "supportPhone" VARCHAR(11) NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(4000) NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL DEFAULT 'Geral',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceCents" INTEGER NOT NULL,
    "compareAtCents" INTEGER,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "weightGrams" INTEGER NOT NULL DEFAULT 300,
    "widthCm" INTEGER NOT NULL DEFAULT 20,
    "heightCm" INTEGER NOT NULL DEFAULT 5,
    "lengthCm" INTEGER NOT NULL DEFAULT 25,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "label" VARCHAR(100) NOT NULL DEFAULT 'Único',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lowStock" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "orderId" UUID,
    "requestKey" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRule" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "postalCodeFrom" VARCHAR(8) NOT NULL,
    "postalCodeTo" VARCHAR(8) NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "perKgCents" INTEGER NOT NULL DEFAULT 0,
    "freeAboveCents" INTEGER,
    "minDays" INTEGER NOT NULL DEFAULT 1,
    "maxDays" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopShippingQuote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cartHash" VARCHAR(64) NOT NULL,
    "postalCode" VARCHAR(8) NOT NULL,
    "deliveryMethod" VARCHAR(20) NOT NULL,
    "options" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopShippingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "requestKey" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "recipient" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(11) NOT NULL,
    "address" JSONB NOT NULL,
    "deliveryMethod" VARCHAR(20) NOT NULL,
    "shippingName" VARCHAR(150) NOT NULL,
    "shippingService" VARCHAR(80) NOT NULL,
    "shippingDays" INTEGER NOT NULL,
    "shippingSnapshot" JSONB NOT NULL DEFAULT '{}',
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inventoryConsumedAt" TIMESTAMP(3),
    "stockRestoredAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "trackingCode" VARCHAR(100) NOT NULL DEFAULT '',
    "trackingUrl" VARCHAR(1000) NOT NULL DEFAULT '',
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "productName" VARCHAR(150) NOT NULL,
    "variantLabel" VARCHAR(100) NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,

    CONSTRAINT "ShopOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopPayment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "TicketPaymentMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "refundReference" VARCHAR(100),
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_active_archivedAt_category_idx" ON "Product"("active", "archivedAt", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_requestKey_key" ON "StockMovement"("requestKey");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopShippingQuote_expiresAt_idx" ON "ShopShippingQuote"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_number_key" ON "ShopOrder"("number");

-- CreateIndex
CREATE INDEX "ShopOrder_status_expiresAt_idx" ON "ShopOrder"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ShopOrder_userId_createdAt_idx" ON "ShopOrder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_userId_requestKey_key" ON "ShopOrder"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "ShopOrderItem_variantId_idx" ON "ShopOrderItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrderItem_orderId_variantId_key" ON "ShopOrderItem"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopPayment_orderId_key" ON "ShopPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopPayment_reference_key" ON "ShopPayment"("reference");
CREATE UNIQUE INDEX "ShopPayment_refundReference_key" ON "ShopPayment"("refundReference");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayIntent_shopOrderId_key" ON "GatewayIntent"("shopOrderId");

-- AddForeignKey
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopShippingQuote" ADD CONSTRAINT "ShopShippingQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPayment" ADD CONSTRAINT "ShopPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPayment" ADD CONSTRAINT "ShopPayment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial intents have exactly one immutable business target.
ALTER TABLE "GatewayIntent" DROP CONSTRAINT "GatewayIntent_target_valid";
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_target_valid"
  CHECK (num_nonnulls("ticketId", "chargeId", "shopOrderId") = 1);
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_modes_valid" CHECK ("mode" IN ('INTERNAL','EXTERNAL') AND "shippingProvider" IN ('RULES','MELHOR_ENVIO'));
ALTER TABLE "Product" ADD CONSTRAINT "Product_values_valid" CHECK (
  "priceCents" BETWEEN 0 AND 100000000 AND "costCents" BETWEEN 0 AND 100000000
  AND ("compareAtCents" IS NULL OR "compareAtCents" > "priceCents") AND "version" >= 0
  AND "weightGrams" BETWEEN 1 AND 100000 AND "widthCm" BETWEEN 1 AND 200 AND "heightCm" BETWEEN 1 AND 200 AND "lengthCm" BETWEEN 1 AND 200
);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stock_valid" CHECK ("stock" BETWEEN 0 AND 1000000 AND "lowStock" BETWEEN 0 AND 100000 AND "version" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_valid" CHECK ("quantity" <> 0 AND "balanceAfter" >= 0 AND "kind" IN ('INITIAL','ADJUSTMENT','SALE','RETURN'));
ALTER TABLE "ShippingRule" ADD CONSTRAINT "ShippingRule_values_valid" CHECK (
  "postalCodeFrom" ~ '^\d{8}$' AND "postalCodeTo" ~ '^\d{8}$' AND "postalCodeFrom" <= "postalCodeTo"
  AND "baseCents" BETWEEN 0 AND 100000000 AND "perKgCents" BETWEEN 0 AND 100000000
  AND ("freeAboveCents" IS NULL OR "freeAboveCents" BETWEEN 0 AND 100000000)
  AND "minDays" BETWEEN 0 AND 120 AND "maxDays" BETWEEN "minDays" AND 120 AND "version" >= 0
);
ALTER TABLE "ShopShippingQuote" ADD CONSTRAINT "ShopShippingQuote_method_valid" CHECK ("deliveryMethod" IN ('PICKUP','DELIVERY'));
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_values_valid" CHECK (
  "subtotalCents" BETWEEN 0 AND 100000000 AND "shippingCents" BETWEEN 0 AND 100000000
  AND "totalCents" BETWEEN 0 AND 100000000 AND "totalCents"::bigint = "subtotalCents"::bigint + "shippingCents"::bigint
  AND "deliveryMethod" IN ('PICKUP','DELIVERY') AND "version" >= 0
  AND "status" IN ('PENDING','PAID','PREPARING','READY','SHIPPED','DELIVERED','CANCELED','REFUNDED','REFUND_REVIEW')
);
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_values_valid" CHECK ("quantity" BETWEEN 1 AND 20 AND "unitPriceCents" BETWEEN 0 AND 100000000 AND "costCents" BETWEEN 0 AND 100000000);
ALTER TABLE "ShopPayment" ADD CONSTRAINT "ShopPayment_values_valid" CHECK ("amountCents" BETWEEN 0 AND 100000000 AND "refundedCents" BETWEEN 0 AND "amountCents");
