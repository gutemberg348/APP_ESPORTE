ALTER TABLE "GatewayIntent" ADD COLUMN "counterOrderId" UUID REFERENCES "ingresso_v1_pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "GatewayIntent_counterOrderId_key" ON "GatewayIntent"("counterOrderId");
ALTER TABLE "GatewayIntent" DROP CONSTRAINT "GatewayIntent_target_valid";
ALTER TABLE "GatewayIntent" ADD CONSTRAINT "GatewayIntent_target_valid" CHECK (num_nonnulls("ticketId","chargeId","shopOrderId","membershipOrderId","counterOrderId") = 1);
