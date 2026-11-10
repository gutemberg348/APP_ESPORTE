CREATE TABLE "ingresso_v1_templates_setor" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "nome" VARCHAR(100) NOT NULL,
  "tipo" VARCHAR(40),
  "descricao" VARCHAR(1000),
  "orientacaoSolar" VARCHAR(20) NOT NULL DEFAULT 'PARCIAL',
  "possuiCadeiras" BOOLEAN NOT NULL DEFAULT false,
  "modeloCadeira" VARCHAR(80),
  "corCadeira" VARCHAR(40),
  "larguraCadeiraCm" INTEGER,
  "possuiEncosto" BOOLEAN NOT NULL DEFAULT false,
  "capacidadeFisica" INTEGER NOT NULL,
  "numerado" BOOLEAN NOT NULL DEFAULT false,
  "acessivel" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingresso_v1_templates_setor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ingresso_v1_templates_setor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ingresso_v1_templates_setor_orientacao_check" CHECK ("orientacaoSolar" IN ('SOL', 'SOMBRA', 'PARCIAL')),
  CONSTRAINT "ingresso_v1_templates_setor_cadeira_check" CHECK (("possuiCadeiras" = false AND "modeloCadeira" IS NULL AND "larguraCadeiraCm" IS NULL) OR ("possuiCadeiras" = true AND "modeloCadeira" IS NOT NULL AND "larguraCadeiraCm" IS NOT NULL AND "larguraCadeiraCm" > 0))
);
ALTER TABLE "ingresso_v1_setores_estadio" ADD COLUMN "templateId" UUID;
ALTER TABLE "ingresso_v1_setores_estadio" ADD CONSTRAINT "ingresso_v1_setores_estadio_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ingresso_v1_templates_setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ingresso_v1_templates_setor_tenantId_nome_key" ON "ingresso_v1_templates_setor"("tenantId", "nome");
CREATE INDEX "ingresso_v1_templates_setor_tenantId_ativo_idx" ON "ingresso_v1_templates_setor"("tenantId", "ativo");
