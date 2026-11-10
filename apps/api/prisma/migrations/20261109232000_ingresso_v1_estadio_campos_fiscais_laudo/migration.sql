-- AlterTable
ALTER TABLE "ingresso_v1_estadios"
  ADD COLUMN IF NOT EXISTS "bairro" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "cnpjProprietarioOrganizador" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "capacidadeOperacionalLaudo" INTEGER;

-- AlterTable
ALTER TABLE "ingresso_v1_setores_estadio"
  ALTER COLUMN "nome" TYPE VARCHAR(160);

-- AlterTable
ALTER TABLE "ingresso_v1_templates_setor"
  ALTER COLUMN "nome" TYPE VARCHAR(160);

