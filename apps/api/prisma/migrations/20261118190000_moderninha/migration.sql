ALTER TABLE "ingresso_v1_pedidos"
  ADD COLUMN "pagbankTentativa" CHAR(64),
  ADD COLUMN "pagbankReferencia" VARCHAR(10);
CREATE UNIQUE INDEX "ingresso_v1_pedidos_pagbankReferencia_key" ON "ingresso_v1_pedidos" ("pagbankReferencia");
CREATE UNIQUE INDEX "pagbank_transacao_unica" ON "ingresso_v1_pedidos" ("transacaoGatewayId") WHERE "metodoBalcao" = 'PAGBANK';
