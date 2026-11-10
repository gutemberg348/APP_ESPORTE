-- AlterTable
ALTER TABLE "ingresso_v1_setores_estadio"
  ADD COLUMN IF NOT EXISTS "localizacao" VARCHAR(250),
  ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;

