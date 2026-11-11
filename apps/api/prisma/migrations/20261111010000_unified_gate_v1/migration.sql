BEGIN;
CREATE FUNCTION ingresso_v1_novo_codigo() RETURNS TEXT LANGUAGE SQL VOLATILE AS $$
  SELECT upper(substr(raw,1,4)||'-'||substr(raw,5,4)||'-'||substr(raw,21,4)||'-'||substr(raw,25,4))
  FROM (SELECT replace(gen_random_uuid()::text, '-', '') AS raw) code;
$$;
ALTER TABLE "ingresso_v1_ingressos" ADD COLUMN "codigoPortaria" VARCHAR(19) NOT NULL DEFAULT ingresso_v1_novo_codigo();
CREATE UNIQUE INDEX "ingresso_v1_ingressos_codigoPortaria_key" ON "ingresso_v1_ingressos"("codigoPortaria");
ALTER TABLE "ingresso_v1_ingressos" ADD CONSTRAINT "ingresso_v1_codigo_portaria_valid" CHECK ("codigoPortaria" ~ '^[A-F0-9]{4}(-[A-F0-9]{4}){3}$');
ALTER TABLE "ingresso_v1_partidas" ADD COLUMN "portariaAtiva" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "portariaAbreEm" TIMESTAMP(3), ADD COLUMN "portariaFechaEm" TIMESTAMP(3);
ALTER TABLE "ingresso_v1_partidas" ADD CONSTRAINT "ingresso_v1_gate_dates_valid" CHECK ("portariaAbreEm" IS NULL OR "portariaFechaEm" IS NULL OR "portariaFechaEm" > "portariaAbreEm");
CREATE TABLE "GateAssignmentV1" (
 "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL, "alocacaoId" UUID NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GateAssignmentV1_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "GateAssignmentV1_alocacaoId_fkey" FOREIGN KEY ("alocacaoId") REFERENCES "ingresso_v1_alocacoes_setor_partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GateAssignmentV1_userId_alocacaoId_key" ON "GateAssignmentV1"("userId","alocacaoId");
CREATE INDEX "GateAssignmentV1_alocacaoId_active_idx" ON "GateAssignmentV1"("alocacaoId","active");
CREATE TABLE "AdmissionV1" (
 "id" UUID NOT NULL PRIMARY KEY, "ingressoId" UUID NOT NULL, "actorId" UUID NOT NULL,
 "requestKey" VARCHAR(80) NOT NULL, "gate" VARCHAR(50) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdmissionV1_ingressoId_fkey" FOREIGN KEY ("ingressoId") REFERENCES "ingresso_v1_ingressos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AdmissionV1_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdmissionV1_ingressoId_key" ON "AdmissionV1"("ingressoId");
CREATE UNIQUE INDEX "AdmissionV1_actorId_requestKey_key" ON "AdmissionV1"("actorId","requestKey");
CREATE INDEX "AdmissionV1_createdAt_actorId_idx" ON "AdmissionV1"("createdAt","actorId");
COMMIT;
