ALTER TYPE "UserRole" ADD VALUE 'TICKET_SELLER';
ALTER TABLE "ingresso_v1_pedidos"
  ADD COLUMN "chaveBalcao" VARCHAR(80),
  ADD COLUMN "metodoBalcao" VARCHAR(12),
  ADD COLUMN "resumoBalcao" CHAR(64);
CREATE UNIQUE INDEX "ingresso_v1_pedidos_usuarioId_chaveBalcao_key" ON "ingresso_v1_pedidos" ("usuarioId", "chaveBalcao");
ALTER TABLE "ingresso_v1_lotes" ADD COLUMN "quantidadeReservada" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ingresso_v1_balcao_pendentes" ON "ingresso_v1_pedidos" ("expiraEm") WHERE "chaveBalcao" IS NOT NULL AND "statusPagamento" = 'PENDENTE';
