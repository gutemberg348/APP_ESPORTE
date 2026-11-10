-- AlterTable
ALTER TABLE "ingresso_v1_setores_estadio"
  ADD COLUMN IF NOT EXISTS "exigeBlocoModulo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "exigeNivelAnel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "instrucaoAcomodacao" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "configuracaoMalhaAssentos" JSONB;

-- AlterTable
ALTER TABLE "ingresso_v1_templates_setor"
  ADD COLUMN IF NOT EXISTS "slug" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "exigeBlocoModulo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "exigeNivelAnel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "instrucaoAcomodacao" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "configuracaoMalhaAssentos" JSONB;

-- AlterTable
ALTER TABLE "ingresso_v1_assentos"
  ADD COLUMN IF NOT EXISTS "nivel" VARCHAR(60);

