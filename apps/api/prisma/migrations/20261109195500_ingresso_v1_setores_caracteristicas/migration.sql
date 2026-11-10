ALTER TABLE "ingresso_v1_setores_estadio"
  ADD COLUMN "orientacaoSolar" VARCHAR(20) NOT NULL DEFAULT 'PARCIAL',
  ADD COLUMN "possuiCadeiras" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "modeloCadeira" VARCHAR(80),
  ADD COLUMN "corCadeira" VARCHAR(40),
  ADD COLUMN "larguraCadeiraCm" INTEGER,
  ADD COLUMN "possuiEncosto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ingresso_v1_setores_estadio"
  ADD CONSTRAINT "ingresso_v1_setores_estadio_orientacaoSolar_check"
  CHECK ("orientacaoSolar" IN ('SOL', 'SOMBRA', 'PARCIAL')),
  ADD CONSTRAINT "ingresso_v1_setores_estadio_cadeira_check"
  CHECK (
    ("possuiCadeiras" = false AND "modeloCadeira" IS NULL AND "corCadeira" IS NULL AND "larguraCadeiraCm" IS NULL AND "possuiEncosto" = false)
    OR
    ("possuiCadeiras" = true AND "modeloCadeira" IS NOT NULL AND "larguraCadeiraCm" IS NOT NULL AND "larguraCadeiraCm" > 0)
  );
