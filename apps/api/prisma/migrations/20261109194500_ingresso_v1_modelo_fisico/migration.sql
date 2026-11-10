ALTER TABLE "ingresso_v1_estadios"
  ADD COLUMN "nomePopular" VARCHAR(150),
  ADD COLUMN "estado" CHAR(2),
  ADD COLUMN "endereco" VARCHAR(250),
  ADD COLUMN "cep" VARCHAR(9),
  ADD COLUMN "descricao" VARCHAR(2000),
  ADD COLUMN "capacidadeSentada" INTEGER,
  ADD COLUMN "capacidadeArquibancada" INTEGER,
  ADD COLUMN "quantidadePortoes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "possuiAcessibilidade" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permiteSetorVisitante" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mapaUrl" VARCHAR(500);

ALTER TABLE "ingresso_v1_setores_estadio"
  ADD COLUMN "tipo" VARCHAR(40),
  ADD COLUMN "bloco" VARCHAR(40),
  ADD COLUMN "nivel" VARCHAR(40),
  ADD COLUMN "descricao" VARCHAR(1000),
  ADD COLUMN "capacidadeVisitante" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acessivel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permiteVisitante" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ingresso_v1_assentos"
  ADD COLUMN "bloco" VARCHAR(40),
  ADD COLUMN "tipo" VARCHAR(40),
  ADD COLUMN "acessivel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reservadoVisitante" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ingresso_v1_estadios"
  ADD CONSTRAINT "ingresso_v1_estadios_capacidades_check"
  CHECK (
    "capacidadeSentada" IS NULL OR "capacidadeSentada" BETWEEN 0 AND "capacidadeMaxima"
  );

ALTER TABLE "ingresso_v1_estadios"
  ADD CONSTRAINT "ingresso_v1_estadios_portoes_check"
  CHECK ("quantidadePortoes" >= 0);

ALTER TABLE "ingresso_v1_setores_estadio"
  ADD CONSTRAINT "ingresso_v1_setores_visitante_check"
  CHECK ("capacidadeVisitante" BETWEEN 0 AND "capacidadeFisica");
