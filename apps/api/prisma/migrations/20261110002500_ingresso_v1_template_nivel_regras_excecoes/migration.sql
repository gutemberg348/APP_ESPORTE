-- CreateTable
CREATE TABLE "template_nivel_regras" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "nome_nivel" VARCHAR(120) NOT NULL,
    "bloco_inicio" INTEGER NOT NULL,
    "bloco_fim" INTEGER NOT NULL,
    "fileira_inicio" VARCHAR(10) NOT NULL,
    "fileira_fim" VARCHAR(10) NOT NULL,
    "cadeiras_por_fileira" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_nivel_regras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_bloco_excecoes" (
    "id" UUID NOT NULL,
    "nivel_regra_id" UUID NOT NULL,
    "numero_bloco" INTEGER NOT NULL,
    "cadeiras_por_fileira" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_bloco_excecoes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ingresso_v1_ingressos"
ADD COLUMN "bloco_escolhido" INTEGER,
ADD COLUMN "fileira_escolhida" VARCHAR(10),
ADD COLUMN "assento_escolhido" INTEGER;

-- CreateIndex
CREATE INDEX "template_nivel_regras_template_id_idx" ON "template_nivel_regras"("template_id");

-- CreateIndex
CREATE INDEX "template_bloco_excecoes_nivel_regra_id_idx" ON "template_bloco_excecoes"("nivel_regra_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_bloco_excecoes_nivel_regra_id_numero_bloco_key" ON "template_bloco_excecoes"("nivel_regra_id", "numero_bloco");

-- CreateIndex
CREATE UNIQUE INDEX "ingresso_v1_ingressos_alocacaoId_bloco_escolhido_fileira_esc_key" ON "ingresso_v1_ingressos"("alocacaoId", "bloco_escolhido", "fileira_escolhida", "assento_escolhido");

-- CreateIndex
CREATE INDEX "ingresso_v1_ingressos_alocacaoId_bloco_escolhido_fileira_esc_idx" ON "ingresso_v1_ingressos"("alocacaoId", "bloco_escolhido", "fileira_escolhida", "assento_escolhido");

-- AddForeignKey
ALTER TABLE "template_nivel_regras" ADD CONSTRAINT "template_nivel_regras_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "ingresso_v1_templates_setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_bloco_excecoes" ADD CONSTRAINT "template_bloco_excecoes_nivel_regra_id_fkey" FOREIGN KEY ("nivel_regra_id") REFERENCES "template_nivel_regras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

