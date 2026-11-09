-- CreateTable
CREATE TABLE "TicketRefundCost" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL,
    "gatewayFeeCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketRefundCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketRefundCost_intentId_key" ON "TicketRefundCost"("intentId");

-- AddForeignKey
ALTER TABLE "TicketRefundCost" ADD CONSTRAINT "TicketRefundCost_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "GatewayIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TicketRefundCost" ADD CONSTRAINT "TicketRefundCost_values_valid" CHECK ("grossCents" > 0 AND "refundedCents" = "grossCents" AND "gatewayFeeCents" BETWEEN 0 AND "grossCents");
