-- CreateEnum
CREATE TYPE "TipoCategoriaIngressoV1" AS ENUM ('INTEIRA', 'MEIA', 'SOCIO', 'CORTESIA');

-- CreateEnum
CREATE TYPE "StatusPartidaIngressoV1" AS ENUM ('RASCUNHO', 'PUBLICADA', 'ESGOTADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusPagamentoIngressoV1" AS ENUM ('PENDENTE', 'PAGO', 'EXPIRADO', 'CANCELADO', 'ESTORNADO', 'ESTORNADO_PARCIALMENTE');

-- CreateEnum
CREATE TYPE "StatusIngressoV1" AS ENUM ('DISPONIVEL', 'RESERVADO', 'VENDIDO', 'UTILIZADO', 'CANCELADO', 'INVALIDADO');

-- CreateTable
CREATE TABLE "ingresso_v1_estadios" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "cidade" VARCHAR(100) NOT NULL,
    "capacidadeMaxima" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_estadios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_setores_estadio" (
    "id" UUID NOT NULL,
    "estadioId" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "capacidadeFisica" INTEGER NOT NULL,
    "numerado" BOOLEAN NOT NULL DEFAULT false,
    "portoesAcesso" JSONB NOT NULL DEFAULT '[]',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_setores_estadio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_assentos" (
    "id" UUID NOT NULL,
    "setorId" UUID NOT NULL,
    "fileira" VARCHAR(10) NOT NULL,
    "numero" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingresso_v1_assentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_templates_venda" (
    "id" UUID NOT NULL,
    "estadioId" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_templates_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_regras_setor_template" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "setorId" UUID NOT NULL,
    "capacidadeLiberadaPadrao" INTEGER NOT NULL,
    "precoBaseCentavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ingresso_v1_regras_setor_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_categorias_template" (
    "id" UUID NOT NULL,
    "regraSetorId" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "tipoCategoria" "TipoCategoriaIngressoV1" NOT NULL,
    "percentualDesconto" INTEGER NOT NULL DEFAULT 0,
    "limiteCota" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ingresso_v1_categorias_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_partidas" (
    "id" UUID NOT NULL,
    "estadioId" UUID NOT NULL,
    "templateVendaId" UUID,
    "timeMandante" VARCHAR(120) NOT NULL,
    "timeVisitante" VARCHAR(120) NOT NULL,
    "dataPartida" TIMESTAMP(3) NOT NULL,
    "inicioVendas" TIMESTAMP(3),
    "fimVendas" TIMESTAMP(3),
    "status" "StatusPartidaIngressoV1" NOT NULL DEFAULT 'RASCUNHO',
    "vendasAtivas" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_alocacoes_setor_partida" (
    "id" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "setorId" UUID NOT NULL,
    "capacidadeLiberada" INTEGER NOT NULL,
    "quantidadeVendida" INTEGER NOT NULL DEFAULT 0,
    "quantidadeReservada" INTEGER NOT NULL DEFAULT 0,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ingresso_v1_alocacoes_setor_partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_lotes" (
    "id" UUID NOT NULL,
    "alocacaoId" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "tipoCategoria" "TipoCategoriaIngressoV1" NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "quantidadeMaxima" INTEGER NOT NULL,
    "quantidadeVendida" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingresso_v1_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_pedidos" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "statusPagamento" "StatusPagamentoIngressoV1" NOT NULL DEFAULT 'PENDENTE',
    "transacaoGatewayId" VARCHAR(150),
    "expiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresso_v1_ingressos" (
    "id" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "alocacaoId" UUID NOT NULL,
    "loteId" UUID,
    "pedidoId" UUID,
    "assentoId" UUID,
    "nomeTitular" VARCHAR(150),
    "cpfTitular" VARCHAR(14),
    "status" "StatusIngressoV1" NOT NULL DEFAULT 'DISPONIVEL',
    "chaveQr" VARCHAR(150) NOT NULL,
    "utilizadoEm" TIMESTAMP(3),
    "catracaId" VARCHAR(50),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresso_v1_ingressos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingresso_v1_estadios_tenantId_ativo_idx" ON "ingresso_v1_estadios"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_estadios_tenantId_nome_key" ON "ingresso_v1_estadios"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "ingresso_v1_setores_estadio_estadioId_ativo_idx" ON "ingresso_v1_setores_estadio"("estadioId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_setores_estadio_estadioId_nome_key" ON "ingresso_v1_setores_estadio"("estadioId", "nome");

-- CreateIndex
CREATE INDEX "ingresso_v1_assentos_setorId_ativo_idx" ON "ingresso_v1_assentos"("setorId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_assentos_setorId_fileira_numero_key" ON "ingresso_v1_assentos"("setorId", "fileira", "numero");

-- CreateIndex
CREATE INDEX "ingresso_v1_templates_venda_estadioId_ativo_idx" ON "ingresso_v1_templates_venda"("estadioId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_templates_venda_estadioId_nome_key" ON "ingresso_v1_templates_venda"("estadioId", "nome");

-- CreateIndex
CREATE INDEX "ingresso_v1_regras_setor_template_setorId_idx" ON "ingresso_v1_regras_setor_template"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_regras_setor_template_templateId_setorId_key" ON "ingresso_v1_regras_setor_template"("templateId", "setorId");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_categorias_template_regraSetorId_tipoCategoria__key" ON "ingresso_v1_categorias_template"("regraSetorId", "tipoCategoria", "nome");

-- CreateIndex
CREATE INDEX "ingresso_v1_partidas_estadioId_dataPartida_idx" ON "ingresso_v1_partidas"("estadioId", "dataPartida");

-- CreateIndex
CREATE INDEX "ingresso_v1_partidas_status_dataPartida_idx" ON "ingresso_v1_partidas"("status", "dataPartida");

-- CreateIndex
CREATE INDEX "ingresso_v1_alocacoes_setor_partida_setorId_idx" ON "ingresso_v1_alocacoes_setor_partida"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_alocacoes_setor_partida_partidaId_setorId_key" ON "ingresso_v1_alocacoes_setor_partida"("partidaId", "setorId");

-- CreateIndex
CREATE INDEX "ingresso_v1_lotes_alocacaoId_ativo_idx" ON "ingresso_v1_lotes"("alocacaoId", "ativo");

-- CreateIndex
CREATE INDEX "ingresso_v1_pedidos_usuarioId_criadoEm_idx" ON "ingresso_v1_pedidos"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "ingresso_v1_pedidos_partidaId_statusPagamento_idx" ON "ingresso_v1_pedidos"("partidaId", "statusPagamento");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_ingressos_chaveQr_key" ON "ingresso_v1_ingressos"("chaveQr");

-- CreateIndex
CREATE INDEX "ingresso_v1_ingressos_partidaId_status_idx" ON "ingresso_v1_ingressos"("partidaId", "status");

-- CreateIndex
CREATE INDEX "ingresso_v1_ingressos_alocacaoId_status_idx" ON "ingresso_v1_ingressos"("alocacaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_ingressos_partidaId_assentoId_key" ON "ingresso_v1_ingressos"("partidaId", "assentoId");

-- AddForeignKey
ALTER TABLE "ingresso_v1_estadios" ADD CONSTRAINT "ingresso_v1_estadios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_setores_estadio" ADD CONSTRAINT "ingresso_v1_setores_estadio_estadioId_fkey" FOREIGN KEY ("estadioId") REFERENCES "ingresso_v1_estadios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_assentos" ADD CONSTRAINT "ingresso_v1_assentos_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "ingresso_v1_setores_estadio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_templates_venda" ADD CONSTRAINT "ingresso_v1_templates_venda_estadioId_fkey" FOREIGN KEY ("estadioId") REFERENCES "ingresso_v1_estadios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_regras_setor_template" ADD CONSTRAINT "ingresso_v1_regras_setor_template_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ingresso_v1_templates_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_regras_setor_template" ADD CONSTRAINT "ingresso_v1_regras_setor_template_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "ingresso_v1_setores_estadio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_categorias_template" ADD CONSTRAINT "ingresso_v1_categorias_template_regraSetorId_fkey" FOREIGN KEY ("regraSetorId") REFERENCES "ingresso_v1_regras_setor_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_partidas" ADD CONSTRAINT "ingresso_v1_partidas_estadioId_fkey" FOREIGN KEY ("estadioId") REFERENCES "ingresso_v1_estadios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_partidas" ADD CONSTRAINT "ingresso_v1_partidas_templateVendaId_fkey" FOREIGN KEY ("templateVendaId") REFERENCES "ingresso_v1_templates_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_alocacoes_setor_partida" ADD CONSTRAINT "ingresso_v1_alocacoes_setor_partida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "ingresso_v1_partidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_alocacoes_setor_partida" ADD CONSTRAINT "ingresso_v1_alocacoes_setor_partida_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "ingresso_v1_setores_estadio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_lotes" ADD CONSTRAINT "ingresso_v1_lotes_alocacaoId_fkey" FOREIGN KEY ("alocacaoId") REFERENCES "ingresso_v1_alocacoes_setor_partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_pedidos" ADD CONSTRAINT "ingresso_v1_pedidos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_pedidos" ADD CONSTRAINT "ingresso_v1_pedidos_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "ingresso_v1_partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_ingressos_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "ingresso_v1_partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_ingressos_alocacaoId_fkey" FOREIGN KEY ("alocacaoId") REFERENCES "ingresso_v1_alocacoes_setor_partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_ingressos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "ingresso_v1_lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_ingressos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "ingresso_v1_pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_ingressos_assentoId_fkey" FOREIGN KEY ("assentoId") REFERENCES "ingresso_v1_assentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
